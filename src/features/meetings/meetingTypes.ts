export type MeetingStatus = "recording" | "uploaded" | "processing" | "ready" | "failed"

export interface Meeting {
  id: string
  user_id: string
  title: string
  status: MeetingStatus
  audio_path: string | null
  audio_url: string | null
  transcript: string | null
  summary: string | null
  error_message: string | null
  duration_seconds: number | null
  push_token: string | null
  created_at: string
  updated_at: string
}
