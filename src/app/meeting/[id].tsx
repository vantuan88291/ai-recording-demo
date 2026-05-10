import { useEffect, useState, useCallback } from "react"
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { getMeeting, subscribeToMeeting } from "@/features/meetings/meetingRepository"
import type { Meeting } from "@/features/meetings/meetingTypes"

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const data = await getMeeting(id)
    setMeeting(data)
    setLoading(false)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  useEffect(() => {
    if (!id) return
    const channel = subscribeToMeeting(id, (updated) => {
      setMeeting(updated)
    })
    return () => {
      channel.unsubscribe()
    }
  }, [id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!meeting) {
    return (
      <View style={styles.center}>
        <Text>Meeting not found.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {meeting.title ?? "Meeting Detail"}
        </Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.status}>Status: {meeting.status}</Text>
        <Text style={styles.meta}>Created: {new Date(meeting.created_at).toLocaleString()}</Text>
        {meeting.duration_seconds != null && (
          <Text style={styles.meta}>Duration: {meeting.duration_seconds}s</Text>
        )}

        {meeting.status === "processing" && (
          <View style={styles.processingBox}>
            <ActivityIndicator style={{ marginRight: 8 }} />
            <Text>Processing your meeting...</Text>
          </View>
        )}

        {meeting.status === "failed" && (
          <View style={styles.errorBox}>
            <Text style={styles.errorLabel}>Processing failed</Text>
            {meeting.error_message && <Text style={styles.errorText}>{meeting.error_message}</Text>}
          </View>
        )}

        {meeting.transcript && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transcript</Text>
            <Text style={styles.body}>{meeting.transcript}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: "#1976d2", fontSize: 17 },
  body: { color: "#333", fontSize: 15, lineHeight: 22 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { gap: 12, padding: 20 },
  errorBox: {
    backgroundColor: "#ffebee",
    borderRadius: 8,
    gap: 4,
    padding: 12,
  },
  errorLabel: { color: "#c62828", fontWeight: "bold" },
  errorText: { color: "#c62828" },
  flex: { backgroundColor: "#fff", flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomColor: "#ddd",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "600", textAlign: "center" },
  meta: { color: "#888", fontSize: 13 },
  processingBox: {
    alignItems: "center",
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    flexDirection: "row",
    padding: 12,
  },
  section: { gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  status: { color: "#555", fontSize: 15 },
  title: { fontSize: 22, fontWeight: "bold" },
})
