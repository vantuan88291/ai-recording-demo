import Config from "@/config"

const backendUrl = Config.BACKEND_URL

if (!backendUrl) {
  throw new Error("Missing BACKEND_URL mobile config")
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl}/health`, { method: "GET" })
    return response.ok
  } catch {
    return false
  }
}

export async function processMeeting(input: {
  meetingId: string
  audioPath: string
  pushToken?: string | null
}): Promise<void> {
  const response = await fetch(`${backendUrl}/process-meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_id: input.meetingId,
      audio_path: input.audioPath,
      push_token: input.pushToken,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to process meeting: ${response.status}`)
  }
}
