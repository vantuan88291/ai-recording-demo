import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy"

import Config from "@/config"
import { supabase } from "@/services/supabase/supabaseClient"

import type { Meeting, MeetingStatus } from "./meetingTypes"

export async function createMeeting({
  userId,
  pushToken,
}: {
  userId: string
  pushToken: string | null
}): Promise<Meeting> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({ user_id: userId, push_token: pushToken })
    .select()
    .single()
  if (error) throw error
  return data as Meeting
}

export async function updateMeetingStatus(meetingId: string, status: MeetingStatus): Promise<void> {
  const { error } = await supabase.from("meetings").update({ status }).eq("id", meetingId)
  if (error) throw error
}

export async function uploadMeetingAudio({
  userId,
  meetingId,
  fileUri,
}: {
  userId: string
  meetingId: string
  fileUri: string
}): Promise<string> {
  const storagePath = `${userId}/${meetingId}/recording.m4a`

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error("No auth session for upload")

  const uploadUrl = `${Config.SUPABASE_URL}/storage/v1/object/meeting-audio/${storagePath}`
  const result = await uploadAsync(uploadUrl, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": Config.SUPABASE_ANON_KEY,
      "Content-Type": "audio/m4a",
      "x-upsert": "true",
    },
  })

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed: ${result.status} ${result.body}`)
  }
  return storagePath
}

export async function markMeetingUploaded({
  meetingId,
  audioPath,
  durationSeconds,
  pushToken,
}: {
  meetingId: string
  audioPath: string
  durationSeconds: number | null
  pushToken: string | null
}): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "uploaded",
      audio_path: audioPath,
      duration_seconds: durationSeconds,
      push_token: pushToken,
    })
    .eq("id", meetingId)
  if (error) throw error
}

export async function listMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as Meeting[]
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase.from("meetings").select("*").eq("id", id).single()
  if (error) return null
  return data as Meeting
}

export function subscribeToMeeting(id: string, callback: (meeting: Meeting) => void) {
  return supabase
    .channel(`meeting-${id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "meetings",
        filter: `id=eq.${id}`,
      },
      (payload) => callback(payload.new as Meeting),
    )
    .subscribe()
}
