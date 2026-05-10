import os
from openai import OpenAI

from app.settings import settings


client = OpenAI(api_key=settings.openai_api_key)


def transcribe_audio(audio_file_path: str) -> str:
    filename = os.path.basename(audio_file_path)
    # Ensure extension is preserved so Whisper detects the format correctly.
    # Temp file paths like /tmp/tmpXXX.m4a are fine, but we pass an explicit
    # (filename, bytes, content_type) tuple to guarantee the SDK sends the right
    # Content-Disposition and Content-Type headers regardless of SDK version.
    ext = os.path.splitext(filename)[1].lower() or ".m4a"
    content_type_map = {
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".webm": "audio/webm",
    }
    content_type = content_type_map.get(ext, "audio/mp4")

    with open(audio_file_path, "rb") as f:
        audio_bytes = f.read()

    print(f"[openai] sending {len(audio_bytes)} bytes as {filename!r} content-type={content_type}", flush=True)

    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes, content_type),
        language="en",
    )
    return transcript.text
