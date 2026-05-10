import { useState, useCallback } from "react"
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import { useRouter, useFocusEffect } from "expo-router"
import { listMeetings } from "@/features/meetings/meetingRepository"
import type { Meeting } from "@/features/meetings/meetingTypes"
import { load, save } from "@/utils/storage"

const STORAGE_KEY = "meetings_list"

export default function MeetingsScreen() {
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>(() => load<Meeting[]>(STORAGE_KEY) ?? [])
  const [refreshing, setRefreshing] = useState(false)

  const fetch_ = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true)
    try {
      const data = await listMeetings()
      setMeetings(data)
      save(STORAGE_KEY, data)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetch_({ silent: true })
    }, [fetch_]),
  )

  if (meetings.length === 0 && !refreshing) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No meetings yet. Start recording!</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={meetings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshing={refreshing}
      onRefresh={fetch_}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/meeting/${item.id}`)}
        >
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowMeta}>
            {new Date(item.created_at).toLocaleString()} · {item.status}
          </Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#888", fontSize: 16 },
  list: { padding: 16, gap: 12 },
  row: {
    padding: 16,
    backgroundColor: "white",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowMeta: { fontSize: 13, color: "#777", marginTop: 4 },
})
