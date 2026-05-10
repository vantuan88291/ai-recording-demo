import { useState, useRef, useCallback } from "react"

import {
  createMeeting,
  uploadMeetingAudio,
  markMeetingUploaded,
} from "@/features/meetings/meetingRepository"
import {
  requestNotificationPermissions,
  getExpoPushToken,
} from "@/features/notifications/notifications"
import { processMeeting } from "@/services/backend/backendClient"
import { supabase } from "@/services/supabase/supabaseClient"

import {
  requestRecordingPermissions,
  startRecording,
  stopRecording,
  getRecordingUri,
  getDurationSeconds,
  cleanupRecording,
} from "./audioRecorder"

export type RecorderState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "uploading"
  | "processing"
  | "error"

interface RecordingMeta {
  meetingId: string
  userId: string
  pushToken: string | null
  startedAt: number
}

export function useMeetingRecorder() {
  const [state, setState] = useState<RecorderState>("idle")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastMeetingId, setLastMeetingId] = useState<string | null>(null)
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null)
  const metaRef = useRef<RecordingMeta | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setState("starting")
    setErrorMessage(null)
    try {
      // Ensure auth session
      let {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        session = data.session
      }
      if (!session) throw new Error("No auth session")
      const userId = session.user.id

      const permOk = await requestRecordingPermissions()
      if (!permOk) throw new Error("Microphone permission denied")

      await requestNotificationPermissions()
      const pushToken = await getExpoPushToken()
      console.log("[Push] token:", pushToken)

      const meeting = await createMeeting({ userId, pushToken })
      metaRef.current = {
        meetingId: meeting.id,
        userId,
        pushToken,
        startedAt: Date.now(),
      }
      setLastMeetingId(meeting.id)

      await startRecording()
      setState("recording")
      startTimer()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start recording"
      setErrorMessage(message)
      setState("error")
    }
  }, [startTimer])

  const stop = useCallback(async () => {
    if (!metaRef.current) return
    setState("stopping")
    stopTimer()
    try {
      await stopRecording()
      const uri = getRecordingUri()
      if (!uri) throw new Error("No recording file found")
      const duration = getDurationSeconds()
      setLastRecordingUri(uri)
      console.log("[Recording] local file uri:", uri, "duration:", duration, "s")
      const { meetingId, userId, pushToken } = metaRef.current

      setState("uploading")
      const audioPath = await uploadMeetingAudio({ userId, meetingId, fileUri: uri })
      console.log("[Upload] storage path:", audioPath)
      await markMeetingUploaded({
        meetingId,
        audioPath,
        durationSeconds: duration,
        pushToken,
      })

      await processMeeting({ meetingId, audioPath, pushToken })
      setState("idle")
      metaRef.current = null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setErrorMessage(message)
      setState("error")
    } finally {
      await cleanupRecording()
    }
  }, [stopTimer])

  const retry = useCallback(() => {
    setState("idle")
    setErrorMessage(null)
    metaRef.current = null
  }, [])

  return {
    state,
    elapsedSeconds,
    errorMessage,
    lastMeetingId,
    lastRecordingUri,
    start,
    stop,
    retry,
  }
}
