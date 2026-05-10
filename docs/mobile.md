# Mobile Implementation

This document describes the Expo mobile implementation for the AI meeting recorder. It assumes this repo keeps Expo Router files under `src/app`.

## Scope

Implement:

- File-based routes for recording, meeting history, and meeting detail.
- `expo-audio` recording flow using the SDK 55 API.
- Background recording native configuration through a custom config plugin.
- Supabase client usage for meeting rows and audio upload.
- `expo-notifications` registration and notification tap handling.
- Deep link routing to `/meeting/[id]`.

Do not spend much time on visual polish. Build a minimal UI that proves the end-to-end feature works.

## Dependencies

Install mobile dependencies:

```bash
yarn expo install expo-audio expo-notifications
yarn add @supabase/supabase-js
```

## Mobile Configuration

This repo already has an Ignite-style config layer:

```text
src/config/config.dev.ts
src/config/config.prod.ts
src/config/index.ts
```

Add these fields to `ConfigBaseProps` in `src/config/config.base.ts`:

```ts
API_URL: string
SUPABASE_URL: string
SUPABASE_ANON_KEY: string
BACKEND_URL: string
```

Put mobile runtime values in `src/config/config.dev.ts`.

### Platform-specific host addresses

`127.0.0.1` on Android emulator points to the emulator itself, not the laptop. Use a platform-based host:

```ts
import { Platform } from "react-native"

const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1"
// For physical device on the same WiFi, use the laptop's LAN IP instead:
// const host = "192.168.x.x"

export default {
  API_URL: `http://${host}:8000`,
  SUPABASE_URL: `http://${host}:54321`,
  SUPABASE_ANON_KEY: "<local-anon-key>",
  BACKEND_URL: `http://${host}:8000`,
}
```

| Platform | Host |
|----------|------|
| iOS Simulator | `127.0.0.1` |
| Android Emulator | `10.0.2.2` |
| Physical device (same WiFi) | Laptop's LAN IP |

Never put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in mobile config. These files are bundled into the app and are not secret storage.

## Recommended Mobile File Structure

```text
src/
  app/
    _layout.tsx
    (tabs)/
      _layout.tsx
      index.tsx
      meetings.tsx
    meeting/
      [id].tsx
  features/
    meetings/
      meetingTypes.ts
      meetingRepository.ts
    notifications/
      notificationNavigation.ts
      notifications.ts
    recording/
      audioRecorder.ts
      useMeetingRecorder.ts
  services/
    backend/
      backendClient.ts
    supabase/
      supabaseClient.ts
plugins/
  withBackgroundAudio.ts
```

Keep screens thin. Put business logic in `features/*` and API clients in `services/*`.

## Routes

Create these routes:

```text
src/app/(tabs)/_layout.tsx
src/app/(tabs)/index.tsx
src/app/(tabs)/meetings.tsx
src/app/meeting/[id].tsx
```

Route responsibilities:

- `src/app/(tabs)/index.tsx`: Home and recording screen.
- `src/app/(tabs)/meetings.tsx`: List previous meetings with local cache.
- `src/app/meeting/[id].tsx`: Show meeting status, summary, transcript, and errors. Includes custom header and back button.
- `src/app/_layout.tsx`: Global providers, notification response handling.

## Supabase Client

Create `src/services/supabase/supabaseClient.ts`:

```ts
import { createClient } from "@supabase/supabase-js"
import Config from "@/config"

export const supabase = createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY)
```

Anonymous auth is used for the take-home. Call `supabase.auth.signInAnonymously()` before creating the first meeting row. Every `meetings.user_id` must map to the authenticated Supabase user.

## Recording Wrapper — expo-audio SDK 55 API

`expo-audio` SDK 55 has a completely different API from older Expo SDKs. Do not use `Audio.Recording.createAsync` — that is the old API and does not exist in SDK 55.

The correct SDK 55 API uses `AudioModule.AudioRecorder`:

```ts
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
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true, shouldPlayInBackground: true })
  recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY)
  await recorder.prepareToRecordAsync()
  recorder.record()
  savedDurationSeconds = 0
}

export async function stopRecording(): Promise<void> {
  if (!recorder) return
  // Read currentTime BEFORE stop — it resets to 0 after stopping
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
  recorder = null
  savedDurationSeconds = 0
}
```

Key gotchas:
- `recorder.currentTime` must be read **before** calling `stop()` — it resets to 0 after stop.
- Use `RecordingPresets.HIGH_QUALITY` for best audio quality.
- `recorder.record()` is synchronous (no `await`).

## Audio Upload — expo-file-system/legacy

The Supabase JS client does not correctly serialize React Native `Blob` objects for binary upload. Using `fetch` with a blob will result in a 0-byte file on the server.

**Use `expo-file-system/legacy` `uploadAsync` instead:**

```ts
import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy"

const uploadUrl = `${Config.SUPABASE_URL}/storage/v1/object/meeting-audio/${storagePath}`
const result = await uploadAsync(uploadUrl, fileUri, {
  httpMethod: "POST",
  uploadType: FileSystemUploadType.BINARY_CONTENT,
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: Config.SUPABASE_ANON_KEY,
    "Content-Type": "audio/m4a",
    "x-upsert": "true",
  },
})
if (result.status < 200 || result.status >= 300) {
  throw new Error(`Upload failed: ${result.status} ${result.body}`)
}
```

Note: import from `expo-file-system/legacy`, not `expo-file-system`. `FileSystemUploadType` is only available in the legacy export.

Storage path format:

```text
<user-id>/<meeting-id>/recording.m4a
```

## useMeetingRecorder Hook

`src/features/recording/useMeetingRecorder.ts` orchestrates the full flow and exposes:

```ts
{
  state: "idle" | "starting" | "recording" | "stopping" | "uploading" | "processing" | "error"
  elapsedSeconds: number
  errorMessage: string | null
  lastMeetingId: string | null
  lastRecordingUri: string | null  // local file URI for playback verification
  start: () => Promise<void>
  stop: () => Promise<void>
  retry: () => void
}
```

Start flow:
1. Check or create Supabase anonymous auth session.
2. Request microphone permission.
3. Request notification permission and fetch Expo push token.
4. Create `meetings` row with status `recording`.
5. Start audio recorder.
6. Start elapsed timer.

Stop flow:
1. Stop recorder, read `currentTime` before stop.
2. Get local URI, save to `lastRecordingUri` (for playback).
3. Upload to Supabase Storage via `uploadAsync`.
4. Update meeting row to `uploaded` with `audio_path` and `push_token`.
5. Call `POST /process-meeting`.
6. Set state to `processing`.

## Meetings Tab — Local Cache

`src/app/(tabs)/meetings.tsx` uses MMKV storage from `src/utils/storage` to show cached meetings instantly while fetching fresh data in the background:

```ts
import { load, save } from "@/utils/storage"

const STORAGE_KEY = "meetings_list"

const [meetings, setMeetings] = useState<Meeting[]>(
  () => load<Meeting[]>(STORAGE_KEY) ?? []
)
```

On focus, fetch from Supabase and save to storage:
```ts
const data = await listMeetings()
setMeetings(data)
save(STORAGE_KEY, data)
```

This means the list renders immediately from cache without a loading spinner, and updates silently when fresh data arrives. Also supports pull-to-refresh.

## Meeting Detail — Custom Header

The root layout uses `<Slot />` instead of `<Stack />`, so `Stack.Screen` options have no effect. Add a custom header directly in `src/app/meeting/[id].tsx`:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"

const insets = useSafeAreaInsets()
const router = useRouter()

return (
  <View style={[{ flex: 1, paddingTop: insets.top }]}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {meeting.title ?? "Meeting Detail"}
      </Text>
      <View style={{ width: 60 }} />
    </View>
    <ScrollView>...</ScrollView>
  </View>
)
```

Use `useSafeAreaInsets().top` as `paddingTop` to avoid the notch/status bar.

## Custom Config Plugin

Create `plugins/withBackgroundAudio.ts`.

iOS configuration:
- Add `audio` to `UIBackgroundModes`.
- Add `NSMicrophoneUsageDescription`.

Android configuration:
- Add `android.permission.RECORD_AUDIO`.
- Add `android.permission.FOREGROUND_SERVICE`.
- Add `android.permission.FOREGROUND_SERVICE_MICROPHONE`.

Use `AndroidConfig.Permissions.addPermission` (not `AndroidConfig.Manifest.addUsesPermission` — that does not exist in SDK 55).

Register plugins in `app.config.ts`:

```ts
plugins: [...existingPlugins, "expo-audio", "expo-notifications", "./plugins/withBackgroundAudio"]
```

Regenerate native projects after any plugin change:

```bash
yarn prebuild:clean
yarn ios
```

## Push Notifications

Create `src/features/notifications/notifications.ts`:

```ts
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return token.data
  } catch {
    return null
  }
}
```

Push notification requirements:
- `projectId` must be set in `app.json` under `extra.eas.projectId`. Without it, `getExpoPushTokenAsync` throws and returns `null`.
- iOS physical device requires APNs credentials linked to the EAS project. Run `eas credentials -p ios` and configure an APNs Key. EAS manages the `.p8` key — no need for a `.p12` certificate.
- Push tokens are `null` on simulators — the backend skips push silently in this case.

To verify the push token is being obtained, add a log after `getExpoPushToken()`:

```ts
const pushToken = await getExpoPushToken()
console.log("[Push] token:", pushToken)
```

### APNs setup for iOS physical device

1. Run `eas credentials -p ios` → select build profile → choose APNs Key → let EAS generate or upload your own `.p8` from Apple Developer Portal.
2. Alternatively, upload via expo.dev → Project → Credentials → iOS → APNs Keys.
3. Rebuild the app after configuring credentials.

## Notifications — Deep Link Handling

Handle notification taps in `src/app/_layout.tsx`:

```ts
const sub = addNotificationResponseListener((response) => {
  handleNotificationResponse(response, router)
})
```

`handleNotificationResponse` in `src/features/notifications/notificationNavigation.ts` extracts `meetingId` from `notification.request.content.data` and calls `router.push(`/meeting/${meetingId}`)`.

Also handle cold start (app opened from notification tap):

```ts
getInitialNotificationResponse().then((response) => {
  if (response) handleNotificationResponse(response, router)
})
```

## Playback for Verification

The home screen can play back the last recording locally using `useAudioPlayer` from `expo-audio`:

```ts
const player = useAudioPlayer(lastRecordingUri ?? null)

// Play/pause button:
player.playing ? player.pause() : player.play()
```

This lets you verify the recording file is valid before it reaches the backend.

## Mobile Testing Checklist

- Microphone permission appears and is handled.
- Notification permission appears and push token is logged.
- Start creates a `meetings` row with status `recording`.
- Recording continues while app is backgrounded.
- Recording continues while screen is locked.
- Stop creates a local audio file (verify by playing back on home screen).
- Audio uploads to `meeting-audio/<user-id>/<meeting-id>/recording.m4a` (check file size > 0 in Supabase Studio).
- Meeting row updates to `uploaded`.
- App calls backend with `meeting_id`, `audio_path`, and `push_token`.
- Meeting list shows the new meeting (loaded from cache instantly).
- Detail screen displays `processing`, then `ready` via Realtime subscription.
- Notification tap opens the matching meeting detail route.
- Custom header and back button visible on meeting detail screen.
- Failed upload or backend trigger shows retry UI.
