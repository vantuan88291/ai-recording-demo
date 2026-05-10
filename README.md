# AI Meeting Recorder


Record in-person meetings, transcribe with OpenAI Whisper, and get a summary delivered via push notification.

<video src="https://github.com/user-attachments/assets/1c3eb128-b194-45a5-81ed-1388e0236e2c" width="352" height="720"></video>

## Stack

- **Mobile**: Expo SDK 55, Expo Router, expo-audio, expo-notifications, Supabase JS
- **Backend**: Python FastAPI, OpenAI Whisper, Supabase service role
- **Database**: Supabase (local via Docker)

---

## Prerequisites

- Node.js >= 20, Yarn 4
- Python 3.11+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required for Supabase local)
- Xcode (iOS) or Android Studio (Android)
- Supabase CLI: `brew install supabase/tap/supabase`
- ffmpeg (required for audio conversion): `brew install ffmpeg`

---

## 1. Supabase (local)

```bash
# Start local Supabase services (requires Docker Desktop running)
supabase start

# Apply database migrations (creates meetings table, storage bucket, RLS policies)
supabase db reset
```

After `supabase start`, copy the printed keys:

| Key | Where to put it |
|-----|----------------|
| `anon key` (Publishable) | `src/config/config.dev.ts` → `SUPABASE_ANON_KEY` |
| `service_role key` (Secret) | `backend/.env` → `SUPABASE_SERVICE_ROLE_KEY` |

Supabase Studio runs at **http://127.0.0.1:54323**

To stop:
```bash
supabase stop
```

---

## 2. Backend

```bash
cd backend

# First time: create virtualenv and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in env file
cp .env.example .env
# Fill in: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY
```

`backend/.env` example:
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_AUDIO_BUCKET=meeting-audio
EXPO_ACCESS_TOKEN=
```

Run the backend:
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:
```bash
curl http://127.0.0.1:8000/health
# {"ok":true}
```

---

## 3. Mobile App

### Install dependencies

```bash
yarn install
yarn expo install expo-audio expo-notifications expo-constants
yarn add @supabase/supabase-js
```

### Configure `src/config/config.dev.ts`

```ts
import { Platform } from "react-native"

const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1"
// Use your LAN IP (e.g. 192.168.1.x) when testing on a physical device

export default {
  API_URL: `http://${host}:8000`,
  SUPABASE_URL: `http://${host}:54321`,
  SUPABASE_ANON_KEY: "sb_publishable_...",
  BACKEND_URL: `http://${host}:8000`,
}
```

> **Physical device**: replace `host` with your laptop's LAN IP so the device can reach the backend and Supabase.

### Build and run

```bash
# Regenerate native projects after plugin changes
yarn prebuild:clean

# iOS
yarn ios

# Android
yarn android
```

> Expo Go is **not supported** — background audio requires a native build.

---

## User Flow

1. Tap **Start recording** — app signs in anonymously, requests mic + notification permission, creates a `meetings` row, starts recording.
2. App records audio including while backgrounded or screen locked.
3. Tap **Stop recording** — audio uploads to Supabase Storage, backend is triggered.
4. Backend transcribes with Whisper, generates summary, updates the meeting row, sends push notification.
5. Tap the notification → opens `/meeting/[id]` with transcript and summary.

---

## Network addresses

| Platform | Supabase / Backend URL |
|----------|----------------------|
| iOS Simulator | `http://127.0.0.1` |
| Android Emulator | `http://10.0.2.2` |
| Physical device (same WiFi) | `http://<laptop-LAN-IP>` |

---

## Project Structure

```
src/
  app/
    _layout.tsx          # Root layout, notification handling
    (tabs)/
      index.tsx          # Home / recording screen
      meetings.tsx       # Meeting list
    meeting/[id].tsx     # Meeting detail
  features/
    meetings/            # Types, repository, hooks
    notifications/       # Push token, notification handlers
    recording/           # Audio recorder wrapper, useMeetingRecorder hook
  services/
    supabase/            # Supabase client
    backend/             # Backend API client
  config/                # Dev / prod config

backend/
  app/
    main.py              # FastAPI app, POST /process-meeting
    meeting_processor.py # Full processing pipeline
    storage.py           # Download audio from Supabase Storage
    openai_client.py     # Whisper transcription
    summarizer.py        # GPT-4o-mini summary
    expo_push.py         # Expo push notification

supabase/
  migrations/            # meetings table, RLS, storage bucket
```
