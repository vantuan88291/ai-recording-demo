# AI Meeting Recorder Docs Index

This folder contains implementation-oriented documentation for building the AI meeting recorder. These docs are written for AI agents and engineers who will implement the feature in this repository.

Start here, then open the file that matches the part of the system you are implementing.

## Product Goal

Build a simple Expo mobile app that records in-person meetings, keeps recording while backgrounded, uploads the audio, processes it with a Python backend, and sends a push notification when the transcript and summary are ready.

Expected user flow:

1. User taps `Start recording`.
2. App records audio, including while backgrounded or screen locked.
3. User taps `Stop recording`.
4. App uploads audio to Supabase Storage.
5. App calls the Python backend.
6. Backend converts audio to WAV, transcribes with OpenAI Whisper, and generates a summary.
7. Backend updates Supabase and sends an Expo push notification.
8. User taps the notification and lands on `/meeting/[id]`.

## Documentation Map

- [Mobile Implementation](./mobile.md): Expo SDK 55 API, Expo Router routes, platform-specific networking config, `expo-audio` SDK 55 API (new `AudioModule.AudioRecorder`), `expo-file-system/legacy` binary upload, background recording config plugin, Supabase client usage, push notification setup, MMKV cache for meetings list, custom header/back button on detail screen.
- [Backend Implementation](./backend.md): FastAPI service with `BackgroundTasks`, audio conversion using `afconvert`/ffmpeg (required for iOS M4A files), OpenAI Whisper transcription, summary generation, Supabase service-role updates, and Expo push delivery.
- [Supabase Local Setup](./supabase.md): Supabase CLI setup, `config.toml` required fixes, local services, database schema, storage bucket, RLS policies, and environment values.

## Required Stack

- Expo SDK 55.
- Expo Router.
- `expo-audio` (SDK 55 new API — `AudioModule.AudioRecorder`).
- `expo-notifications`.
- `expo-file-system/legacy` (for binary audio upload).
- `@supabase/supabase-js`.
- Python FastAPI.
- Supabase local development.
- OpenAI Whisper model `whisper-1`.
- OpenAI `gpt-4o-mini` for summary.
- `afconvert` (macOS built-in) + `ffmpeg` (brew install) for audio conversion.

## Repository-Specific Notes

- This repo uses `src/app` for Expo Router routes. Do not move routes to a root `app` folder unless the project structure is intentionally changed.
- The app is already configured with `main: "expo-router/entry"` in `package.json`.
- The root layout uses `<Slot />` not `<Stack />` — `Stack.Screen` options have no effect. Add custom headers directly in screen components using `useSafeAreaInsets`.
- Use simple UI. The evaluation priority is feature correctness, not visual polish.
- This project requires a dev client or native build for background audio. Expo Go is not enough.
- Put mobile public values such as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `BACKEND_URL` in `src/config/config.dev.ts` for development.
- Never put the OpenAI API key or Supabase service role key in mobile config. Use backend-only environment variable `OPENAI_API_KEY`.
- On Android emulator, use `10.0.2.2` instead of `127.0.0.1` to reach the laptop. On physical device, use the laptop's LAN IP.

## Known Gotchas

- **expo-audio SDK 55 API**: Use `AudioModule.AudioRecorder`, not `Audio.Recording.createAsync`. Read `recorder.currentTime` before calling `stop()` — it resets to 0 after stop.
- **Binary upload from React Native**: Do not use `fetch` + `Blob` for Supabase Storage upload — React Native Blob does not serialize correctly, resulting in a 0-byte file. Use `expo-file-system/legacy` `uploadAsync` with `FileSystemUploadType.BINARY_CONTENT`.
- **iOS M4A and Whisper**: iOS records M4A files with an Apple-specific `chnl` box (version 1) that ffmpeg 8.x rejects. Convert to 16kHz mono WAV using `afconvert` before sending to Whisper.
- **supabase/config.toml**: `ip_version` must be `"IPv4"` (capital, not `"ipv4"`). Add `[edge_runtime] enabled = false` to avoid `@panva/jose` 403 errors.
- **AndroidConfig plugin API**: Use `AndroidConfig.Permissions.addPermission`, not `AndroidConfig.Manifest.addUsesPermission` (does not exist in SDK 55).
- **Push notifications on physical device**: Require APNs credentials linked to the EAS project. Run `eas credentials -p ios` to configure. Tokens are `null` on simulators — backend must handle null token gracefully.

## Suggested Implementation Order

1. Read [Supabase Local Setup](./supabase.md) — fix `config.toml`, create local schema, storage bucket, and RLS policies.
2. Read [Mobile Implementation](./mobile.md) — add routes, Supabase client, recording flow (SDK 55 API), upload flow, config plugin, and notification handlers.
3. Read [Backend Implementation](./backend.md) — add the FastAPI service with audio conversion pipeline.
4. Test with mocked transcription first (return a hardcoded string from `transcribe_audio`).
5. Replace the mock with OpenAI Whisper once upload and backend trigger are confirmed working.
6. Test the complete flow on a physical device.
7. Configure APNs credentials for push notifications on iOS physical device.

## Acceptance Checklist

- Start recording creates a `meetings` row with status `recording`.
- Recording continues while app is backgrounded or screen locked.
- Stop recording uploads audio to private Supabase Storage (file size > 0).
- Backend receives `meeting_id`, `audio_path`, and `push_token`.
- Backend converts audio to WAV using `afconvert` before Whisper.
- Backend updates status from `processing` to `ready` or `failed`.
- Transcript and summary are saved to Supabase.
- Push notification is sent when processing completes.
- Tapping the notification opens `/meeting/[id]`.
- Meeting list loads from cache instantly and refreshes from Supabase in background.
- Meeting detail screen has a header with title and back button.
- RLS prevents users from reading or writing other users' meetings.
