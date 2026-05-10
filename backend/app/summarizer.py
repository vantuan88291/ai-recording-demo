from app.openai_client import client


def summarize_transcript(transcript: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You summarize in-person meeting transcripts into concise, "
                    "useful notes with decisions and action items."
                ),
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
