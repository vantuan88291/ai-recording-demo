import tempfile
import os
import httpx

from app.supabase_client import supabase
from app.settings import settings


async def download_audio_to_tempfile(audio_path: str | None, audio_url: str | None) -> str:
    """Download audio from Supabase Storage or URL to a temporary file. Returns temp file path."""
    suffix = _get_suffix(audio_path or audio_url or ".m4a")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    tmp.close()

    try:
        if audio_path:
            response = supabase.storage.from_(settings.supabase_audio_bucket).download(audio_path)
            print(f"[storage] download response type: {type(response)}", flush=True)
            print(f"[storage] download response length: {len(response) if response else 'None/empty'}", flush=True)
            with open(tmp_path, "wb") as f:
                f.write(response)
            size_on_disk = os.path.getsize(tmp_path)
            print(f"[storage] tmp file: {tmp_path} | size on disk: {size_on_disk} bytes", flush=True)
            if size_on_disk == 0:
                raise ValueError(f"Downloaded file is empty: {audio_path}")
            with open(tmp_path, "rb") as f:
                magic = f.read(16)
            print(f"[storage] file magic bytes: {magic.hex()} | ascii: {magic}", flush=True)
        elif audio_url:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.get(audio_url)
                r.raise_for_status()
                with open(tmp_path, "wb") as f:
                    f.write(r.content)
            print(f"[storage] downloaded from url, size: {os.path.getsize(tmp_path)} bytes", flush=True)
        else:
            raise ValueError("Either audio_path or audio_url must be provided")
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

    return tmp_path


def _get_suffix(path: str) -> str:
    for ext in (".m4a", ".mp4", ".caf", ".wav", ".mp3"):
        if path.endswith(ext):
            return ext
    return ".m4a"
