import httpx

from app.settings import settings


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


async def send_meeting_failed_push(push_token: str, meeting_id: str) -> None:
    message = {
        "to": push_token,
        "sound": "default",
        "title": "Meeting processing failed",
        "body": "Tap to view details.",
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
