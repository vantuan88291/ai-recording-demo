import { StyleSheet, View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useAudioPlayer } from "expo-audio"
import { useEffect } from "react"
import { useMeetingRecorder } from "@/features/recording/useMeetingRecorder"
import { checkHealth } from "@/services/backend/backendClient"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

function stateLabel(state: string): string {
  switch (state) {
    case "idle":
      return "Ready to record"
    case "starting":
      return "Starting..."
    case "recording":
      return "Recording in progress"
    case "stopping":
      return "Stopping..."
    case "uploading":
      return "Uploading..."
    case "processing":
      return "Processing - check your notifications"
    default:
      return ""
  }
}

export default function HomeScreen() {
  const router = useRouter()
  const { state, elapsedSeconds, errorMessage, lastMeetingId, lastRecordingUri, start, stop, retry } =
    useMeetingRecorder()

  const player = useAudioPlayer(lastRecordingUri ?? null)

  useEffect(() => {
    checkHealth()
  }, [])

  const isRecording = state === "recording"
  const isBusy = state === "starting" || state === "stopping" || state === "uploading"
  const showPlayback = !!lastRecordingUri && (state === "uploading" || state === "processing" || state === "idle" || state === "error")

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Meeting Recorder</Text>


      {state === "recording" && (
        <Text style={styles.elapsed}>{formatTime(elapsedSeconds)}</Text>
      )}

      {state !== "error" && (
        <Text style={styles.status}>{stateLabel(state)}</Text>
      )}

      {state === "error" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.recordBtn,
          isRecording && styles.stopBtn,
          isBusy && styles.disabledBtn,
        ]}
        onPress={isRecording ? stop : start}
        disabled={isBusy || state === "processing" || state === "error"}
      >
        <Text style={styles.recordBtnText}>
          {isRecording ? "Stop recording" : "Start recording"}
        </Text>
      </TouchableOpacity>

      {showPlayback && (
        <View style={styles.playbackBox}>
          <Text style={styles.playbackLabel}>Last recording</Text>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => {
              if (player.playing) {
                player.pause()
              } else {
                player.play()
              }
            }}
          >
            <Text style={styles.playBtnText}>
              {player.playing ? "⏸ Pause" : "▶ Play"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(state === "processing" || (state === "idle" && lastMeetingId)) &&
        lastMeetingId && (
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => router.push(`/meeting/${lastMeetingId}`)}
          >
            <Text style={styles.viewBtnText}>View last meeting</Text>
          </TouchableOpacity>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  elapsed: { fontSize: 48, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  status: { fontSize: 16, color: "#555" },
  errorBox: { alignItems: "center", gap: 8 },
  errorText: { color: "red", textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#eee",
    borderRadius: 8,
  },
  retryBtnText: { fontSize: 14 },
  recordBtn: {
    backgroundColor: "#e53935",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 50,
    marginTop: 16,
  },
  stopBtn: { backgroundColor: "#b71c1c" },
  disabledBtn: { opacity: 0.5 },
  recordBtnText: { color: "white", fontSize: 18, fontWeight: "600" },
  playbackBox: {
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    width: "100%",
  },
  playbackLabel: { fontSize: 13, color: "#888" },
  playBtn: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    backgroundColor: "#1976d2",
    borderRadius: 8,
  },
  playBtnText: { color: "white", fontSize: 16, fontWeight: "600" },
  viewBtn: { marginTop: 8 },
  viewBtnText: { color: "#1976d2", fontSize: 15 },
})
