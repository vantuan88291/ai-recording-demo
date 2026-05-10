# Backend Implementation

This document describes the Python backend for processing uploaded meeting audio.

## Scope

Implement a FastAPI service that:

- Accepts `POST /process-meeting`.
- Marks the meeting as `processing`.
- Downloads private meeting audio from Supabase Storage.
- Converts audio to 16kHz mono WAV for Whisper compatibility.
- Transcribes audio with OpenAI Whisper model `whisper-1`.
- Generates a practical meeting summary.
- Updates the `meetings` row with transcript, summary, and status.
- Sends an Expo push notification when processing completes.

The backend owns all secret values. The mobile app must never receive the OpenAI key or Supabase service role key.

## System Prerequisites

In addition to Python 3.11+, the backend requires:

- **ffmpeg**: used as fallback audio converter. Install with `brew install ffmpeg`.
- **afconvert**: macOS built-in audio converter (preferred over ffmpeg for iOS M4A files).

Both tools are needed because iOS M4A files recorded by `expo-audio` contain an Apple-specific `chnl` box (version 1) that ffmpeg 8.x rejects. `afconvert` handles all iOS audio variants natively. ffmpeg is used as a fallback for non-macOS environments.

## Recommended Backend File Structure

```text
backend/
  app/
    __init__.py
    main.py
    settings.py
    supabase_client.py
    storage.py
    openai_client.py
    summarizer.py
    expo_push.py
    meeting_processor.py
  requirements.txt
  .env.example
```

Keep `main.py` thin. Put processing details in `meeting_processor.py` so the endpoint can later be moved to a queue without rewriting business logic.

## Dependencies

Create `backend/requirements.txt`:

```text
fastapi
uvicorn[standard]
python-dotenv
supabase
openai
httpx
pydantic-settings
```

Install locally:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Always activate the virtualenv before running the backend. Running `uvicorn` from the system Python will fail with `ModuleNotFoundError`.

## Environment Variables

Create `backend/.env.example`:

```bash
OPENAI_API_KEY=
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_AUDIO_BUCKET=meeting-audio
EXPO_ACCESS_TOKEN=
```

Create a local `backend/.env` from the example. Do not commit real secrets.

## Settings

Create `backend/app/settings.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str
    supabase_url: str
    supabase_service_role_key: str
    supabase_audio_bucket: str = "meeting-audio"
    expo_access_token: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
```

## API Contract

Endpoint:

```http
POST /process-meeting
```

Request body:

```json
{
  "meeting_id": "uuid",
  "audio_path": "user-id/meeting-id/recording.m4a",
  "audio_url": "optional-signed-url",
  "push_token": "ExponentPushToken[...]"
}
```

Use `audio_path` as the preferred field because the storage bucket should be private. Accept `audio_url` only as a fallback for compatibility with the assignment prompt.

Response:

```json
{
  "ok": true,
  "meeting_id": "uuid",
  "status": "processing"
}
```

Use FastAPI `BackgroundTasks` so the endpoint returns immediately while processing runs asynchronously. This prevents mobile timeout errors on long recordings.

## FastAPI App

`backend/app/main.py` uses `BackgroundTasks` to avoid blocking the HTTP response:

```python
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.meeting_processor import process_meeting_audio

app = FastAPI(title="AI Meeting Recorder API")


class ProcessMeetingRequest(BaseModel):
    meeting_id: str
    audio_path: str | None = None
    audio_url: str | None = None
    push_token: str | None = None


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/process-meeting")
async def process_meeting(payload: ProcessMeetingRequest, background_tasks: BackgroundTasks):
    if not payload.audio_path and not payload.audio_url:
        raise HTTPException(status_code=400, detail="audio_path or audio_url is required")

    background_tasks.add_task(
        process_meeting_audio,
        meeting_id=payload.meeting_id,
        audio_path=payload.audio_path,
        audio_url=payload.audio_url,
        push_token=payload.push_token,
    )

    return {"ok": True, "meeting_id": payload.meeting_id, "status": "processing"}
```

## Supabase Service Role Client

Create `backend/app/supabase_client.py`:

```python
from supabase import Client, create_client

from app.settings import settings


supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
```

Only the backend should use the service role key. The service role bypasses RLS, which is needed for processing private storage files and updating meetings after the mobile app stops recording.

## Meeting Updates

Use explicit status transitions:

1. `uploaded` from mobile after audio upload.
2. `processing` when backend starts.
3. `ready` after transcript and summary are saved.
4. `failed` if processing fails.

## Audio Download

`backend/app/storage.py` downloads to a temp file using the service role key:

```python
response = supabase.storage.from_(settings.supabase_audio_bucket).download(audio_path)
with open(tmp_path, "wb") as f:
    f.write(response)
```

The download returns `bytes` directly. Write them to a temp file with the correct extension (`.m4a`) so the converter can detect the format.

## Audio Conversion — Critical for iOS

iOS M4A files recorded by `expo-audio` use an Apple-specific `chnl` box (channel layout, version 1) that ffmpeg 8.x rejects with:

```
Unsupported 'chnl' box with version 1, flags: 0
Error opening input: Invalid data found when processing input
```

**Solution**: use `afconvert` (macOS native) as the primary converter, with ffmpeg as a fallback.

```python
import os
import shutil
import subprocess


def convert_to_wav(input_path: str) -> str:
    wav_path = input_path.rsplit(".", 1)[0] + "_converted.wav"

    if shutil.which("afconvert"):
        result = subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", input_path, wav_path],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return wav_path

    result = subprocess.run(
        ["ffmpeg", "-y", "-err_detect", "ignore_err",
         "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr}")
    return wav_path
```

Always delete both the original temp file and the converted WAV in a `finally` block.

## OpenAI Whisper Transcription

Pass the converted WAV path to Whisper. The WAV format (16kHz mono PCM) is universally accepted:

```python
def transcribe_audio(audio_file_path: str) -> str:
    ext = os.path.splitext(audio_file_path)[1].lower()
    content_type_map = {
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
    }
    content_type = content_type_map.get(ext, "audio/wav")

    with open(audio_file_path, "rb") as f:
        audio_bytes = f.read()

    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=(os.path.basename(audio_file_path), audio_bytes, content_type),
    )
    return transcript.text
```

Passing a `(filename, bytes, content_type)` tuple ensures the SDK sends the correct `Content-Disposition` and `Content-Type` headers regardless of SDK version.

## Summary Generation

Create `backend/app/summarizer.py` using `gpt-4o-mini`:

```python
def summarize_transcript(transcript: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You summarize in-person meeting transcripts into concise, useful notes with decisions and action items.",
            },
            {
                "role": "user",
                "content": (
                    "Summarize this meeting. Include short summary, decisions, "
                    "action items with owners if mentioned, and risks/follow-ups.\n\n"
                    f"{transcript}"
                ),
            },
        ],
    )
    return response.choices[0].message.content or ""
```

## Expo Push Notifications

`backend/app/expo_push.py` posts to the Expo push API:

```python
async def send_meeting_ready_push(push_token: str, meeting_id: str) -> None:
    message = {
        "to": push_token,
        "sound": "default",
        "title": "Meeting transcript ready",
        "body": "Tap to view the transcript and summary.",
        "data": {
            "meetingId": meeting_id,
            "url": f"record-meeting://meeting/{meeting_id}",
        },
    }
    headers = {}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            "https://exp.host/--/api/v2/push/send",
            json=message,
            headers=headers,
        )
        response.raise_for_status()
```

If `push_token` is `None` (simulator or permissions denied), the backend skips push silently.

## Processor Flow

`backend/app/meeting_processor.py` orchestrates the full pipeline:

1. Update meeting status to `processing`.
2. Download audio to a temporary `.m4a` file.
3. Convert to 16kHz mono WAV using `afconvert` (or ffmpeg fallback).
4. Transcribe with Whisper.
5. Summarize transcript.
6. Update meeting: `status = ready`, `transcript`, `summary`, `error_message = null`.
7. Send ready push notification if `push_token` exists.
8. On failure: update to `failed`, save safe `error_message`, send failure push, re-raise.
9. In `finally`: delete both the original temp file and the converted WAV.

## Local Run

Start the backend (always activate the virtualenv first):

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
# {"ok":true}
```

Manual process test:

```bash
curl -X POST http://127.0.0.1:8000/process-meeting \
  -H "Content-Type: application/json" \
  -d '{
    "meeting_id": "<meeting-id>",
    "audio_path": "<user-id>/<meeting-id>/recording.m4a",
    "push_token": null
  }'
```

For a physical phone, use a LAN IP for the mobile `BACKEND_URL` value in `src/config/config.dev.ts`.

## Backend Testing Checklist

- `/health` returns `{ "ok": true }`.
- `/process-meeting` rejects requests without `audio_path` or `audio_url`.
- Backend updates meeting status to `processing`.
- Backend downloads private audio from Supabase Storage (check file size > 0).
- `afconvert` converts M4A to WAV successfully (check log for `[afconvert] converted to WAV`).
- Whisper returns transcript text.
- Summary generation returns useful meeting notes.
- Backend updates meeting status to `ready`.
- Backend stores transcript and summary.
- Backend updates meeting status to `failed` on errors.
- Backend sends ready notification with `meetingId` and deep link data.
- No secret values are logged or committed.
