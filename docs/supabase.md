# Supabase Local Setup

This document describes the local Supabase setup for the AI meeting recorder.

## Scope

Set up:

- Local Supabase services.
- `meetings` database table.
- Private audio storage bucket.
- Row Level Security policies.
- Environment values for mobile and backend.

The mobile app uses the Supabase anon key and must be constrained by RLS. The backend uses the service role key and can process private audio files.

## Install Supabase CLI

Install with Homebrew:

```bash
brew install supabase/tap/supabase
```

Verify:

```bash
supabase --version
```

## Initialize Local Supabase

From the repository root (not a subdirectory):

```bash
supabase init
```

Start local services (requires Docker Desktop running):

```bash
supabase start
```

The command prints values including:
- API URL
- anon key (Publishable)
- service role key (Secret)

Copy:
- anon key → `src/config/config.dev.ts` as `SUPABASE_ANON_KEY`
- service role key → `backend/.env` as `SUPABASE_SERVICE_ROLE_KEY`

Stop local services:

```bash
supabase stop
```

## config.toml — Required Fixes

After `supabase init`, edit `supabase/config.toml` with these required fixes before starting:

**1. `ip_version` must be capitalized `"IPv4"` (not `"ipv4"`)**:

```toml
[api]
ip_version = "IPv4"
```

**2. Disable edge runtime** to avoid `@panva/jose` 403 errors on local dev:

```toml
[edge_runtime]
enabled = false
```

**3. Remove any invalid analytics keys** if present (e.g. `vector_port` under `[analytics]`). The Supabase CLI will print a parse error at startup if unknown keys exist.

## Configuration Values

Mobile development values go in `src/config/config.dev.ts`:

```ts
import { Platform } from "react-native"

const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1"
// For physical device on the same WiFi, use the laptop's LAN IP:
// const host = "192.168.x.x"

export default {
  API_URL: `http://${host}:8000`,
  SUPABASE_URL: `http://${host}:54321`,
  SUPABASE_ANON_KEY: "<local-anon-key>",
  BACKEND_URL: `http://${host}:8000`,
}
```

Backend `backend/.env`:

```bash
OPENAI_API_KEY=<openai-api-key>
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
SUPABASE_AUDIO_BUCKET=meeting-audio
EXPO_ACCESS_TOKEN=
```

Never put backend secrets in `src/config/config.dev.ts`. Mobile config values are bundled into the app and can be extracted by users.

## Auth Requirement

Every meeting belongs to a Supabase user:

```text
meetings.user_id -> auth.users.id
```

Anonymous auth is used. Ensure anonymous sign-ins are enabled in `supabase/config.toml`:

```toml
[auth]
enable_anonymous_sign_ins = true
```

The mobile app calls `supabase.auth.signInAnonymously()` before creating the first meeting row.

## Database Schema

Create a migration:

```bash
supabase migration new create_meetings
```

Add:

```sql
create type meeting_status as enum (
  'recording',
  'uploaded',
  'processing',
  'ready',
  'failed'
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled meeting',
  status meeting_status not null default 'recording',
  audio_path text,
  audio_url text,
  transcript text,
  summary text,
  error_message text,
  duration_seconds integer,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meetings_user_id_created_at_idx
on public.meetings (user_id, created_at desc);
```

Add an `updated_at` trigger:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger meetings_set_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();
```

Apply migrations:

```bash
supabase db reset
```

Use `supabase db reset` during local development only. It resets local data.

## Storage Bucket

Create a private bucket for meeting audio:

```sql
insert into storage.buckets (id, name, public)
values ('meeting-audio', 'meeting-audio', false)
on conflict (id) do nothing;
```

Recommended object path:

```text
<user-id>/<meeting-id>/recording.m4a
```

Do not make this bucket public. The backend reads private objects using the service role key.

## RLS for Meetings

Enable RLS:

```sql
alter table public.meetings enable row level security;
```

Allow users to read their own meetings:

```sql
create policy "Users can read their meetings"
on public.meetings for select
using (auth.uid() = user_id);
```

Allow users to create their own meetings:

```sql
create policy "Users can insert their meetings"
on public.meetings for insert
with check (auth.uid() = user_id);
```

Allow users to update their own meetings:

```sql
create policy "Users can update their meetings"
on public.meetings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Optional delete policy for local testing:

```sql
create policy "Users can delete their meetings"
on public.meetings for delete
using (auth.uid() = user_id);
```

The backend service role key bypasses RLS and can update processing fields.

## Storage RLS

Allow authenticated users to upload under their own user-id folder:

```sql
create policy "Users can upload own meeting audio"
on storage.objects for insert
with check (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

Allow authenticated users to read their own audio:

```sql
create policy "Users can read own meeting audio"
on storage.objects for select
using (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

Allow authenticated users to update their own audio for retry uploads:

```sql
create policy "Users can update own meeting audio"
on storage.objects for update
using (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

## Realtime

Enable Realtime for `public.meetings` so the detail screen updates automatically when status changes:

```sql
alter publication supabase_realtime add table public.meetings;
```

The mobile detail screen subscribes to the specific meeting row via `supabase.channel()` and updates the UI when status changes from `processing` to `ready`.

## Local Studio

Open Supabase Studio from the URL printed by `supabase start` (default: `http://127.0.0.1:54323`).

Use Studio to inspect:

- `auth.users`
- `public.meetings`
- Storage bucket `meeting-audio`
- RLS policies

## Supabase Testing Checklist

- Local Supabase starts successfully (check `config.toml` if it fails to start).
- Mobile anon key can authenticate a user anonymously.
- Authenticated user can insert their own meeting.
- Authenticated user can read their own meetings.
- Authenticated user cannot read another user's meetings.
- Authenticated user can upload to `meeting-audio/<own-user-id>/...`.
- Uploaded file has correct size in Studio (not 0 bytes).
- Backend service role key can read private audio object.
- Backend service role key can update `status`, `transcript`, `summary`, and `error_message`.
- Realtime subscription triggers UI update when meeting status changes.
