import {
  AudioModule,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio"
import type { AudioRecorder } from "expo-audio/build/AudioModule.types"

let recorder: AudioRecorder | null = null
let savedDurationSeconds = 0

export async function requestRecordingPermissions(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync()
  return granted
}

export async function startRecording(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    shouldPlayInBackground: true,
  })
  recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY)
  await recorder.prepareToRecordAsync()
  recorder.record()
  savedDurationSeconds = 0
}

export async function stopRecording(): Promise<void> {
  if (!recorder) return
  // read duration before stop — currentTime resets to 0 after stop()
  savedDurationSeconds = recorder.currentTime
  await recorder.stop()
}

export function getRecordingUri(): string | null {
  return recorder?.uri ?? null
}

export function getDurationSeconds(): number {
  return Math.round(savedDurationSeconds)
}

export async function cleanupRecording(): Promise<void> {
  if (recorder) {
    try {
      await recorder.stop()
    } catch {
      // already stopped
    }
    recorder = null
  }
}
