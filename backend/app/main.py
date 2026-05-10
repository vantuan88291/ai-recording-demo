from fastapi import FastAPI, HTTPException, BackgroundTasks
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
