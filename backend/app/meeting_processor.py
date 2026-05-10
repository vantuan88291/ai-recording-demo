import os
import shutil
import subprocess
import logging

from app.supabase_client import supabase
from app.storage import download_audio_to_tempfile
from app.openai_client import transcribe_audio
from app.summarizer import summarize_transcript
from app.expo_push import send_meeting_ready_push, send_meeting_failed_push

logger = logging.getLogger(__name__)


def update_meeting(meeting_id: str, values: dict) -> None:
    supabase.table("meetings").update(values).eq("id", meeting_id).execute()


def convert_to_wav(input_path: str) -> str:
    """Convert audio file to 16kHz mono WAV for Whisper compatibility.

    Tries afconvert first (macOS native — handles all iOS M4A/AAC variants including
    the 'chnl' box v1 that ffmpeg 8.x rejects), then falls back to ffmpeg.
    """
    wav_path = input_path.rsplit(".", 1)[0] + "_converted.wav"

    if shutil.which("afconvert"):
        result = subprocess.run(
            [
                "afconvert",
                "-f", "WAVE",      # output RIFF WAV
                "-d", "LEI16@16000",  # 16-bit little-endian PCM @ 16 kHz
                "-c", "1",         # mono
                input_path,
                wav_path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(f"[afconvert] converted to WAV: {wav_path} ({os.path.getsize(wav_path)} bytes)", flush=True)
            return wav_path
        print(f"[afconvert] failed (rc={result.returncode}): {result.stderr.strip()} — falling back to ffmpeg", flush=True)

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-err_detect", "ignore_err",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            wav_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr}")
    print(f"[ffmpeg] converted to WAV: {wav_path} ({os.path.getsize(wav_path)} bytes)", flush=True)
    return wav_path


async def process_meeting_audio(
    meeting_id: str,
    audio_path: str | None,
    audio_url: str | None,
    push_token: str | None,
) -> None:
    update_meeting(meeting_id, {"status": "processing"})
    tmp_path = None
    wav_path = None
    try:
        tmp_path = await download_audio_to_tempfile(audio_path, audio_url)
        wav_path = convert_to_wav(tmp_path)
        transcript = transcribe_audio(wav_path)
        summary = summarize_transcript(transcript)
        update_meeting(meeting_id, {
            "status": "ready",
            "transcript": transcript,
            "summary": summary,
            "error_message": None,
        })
        if push_token:
            await send_meeting_ready_push(push_token, meeting_id)
    except Exception as exc:
        logger.exception("Failed to process meeting %s", meeting_id)
        update_meeting(meeting_id, {
            "status": "failed",
            "error_message": "Audio transcription failed. Please try again.",
        })
        if push_token:
            try:
                await send_meeting_failed_push(push_token, meeting_id)
            except Exception:
                logger.exception("Failed to send failure push for meeting %s", meeting_id)
        raise exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)
