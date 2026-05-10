-- Create meeting status enum
create type meeting_status as enum (
  'recording',
  'uploaded',
  'processing',
  'ready',
  'failed'
);

-- Create meetings table
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

-- Index for listing user's meetings sorted by newest first
create index meetings_user_id_created_at_idx
on public.meetings (user_id, created_at desc);

-- Auto-update updated_at on row changes
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

-- Enable RLS
alter table public.meetings enable row level security;

-- RLS Policies for meetings table
create policy "Users can read their meetings"
on public.meetings for select
using (auth.uid() = user_id);

create policy "Users can insert their meetings"
on public.meetings for insert
with check (auth.uid() = user_id);

create policy "Users can update their meetings"
on public.meetings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their meetings"
on public.meetings for delete
using (auth.uid() = user_id);

-- Storage bucket for meeting audio (private)
insert into storage.buckets (id, name, public)
values ('meeting-audio', 'meeting-audio', false)
on conflict (id) do nothing;

-- Storage RLS: users can upload to their own folder
create policy "Users can upload own meeting audio"
on storage.objects for insert
with check (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage RLS: users can read their own audio
create policy "Users can read own meeting audio"
on storage.objects for select
using (
  bucket_id = 'meeting-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage RLS: users can update their own audio (for retry uploads)
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

-- Enable Realtime for the meetings table so mobile can subscribe to status changes
alter publication supabase_realtime add table public.meetings;
