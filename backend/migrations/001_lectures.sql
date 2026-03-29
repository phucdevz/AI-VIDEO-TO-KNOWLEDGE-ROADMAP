-- Run in Supabase SQL editor. Adjust types if your project already has a `lectures` table.

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  title text,
  source_url text,
  transcript jsonb not null default '{}'::jsonb,
  flow_data jsonb not null default '{}'::jsonb,
  quiz_data jsonb not null default '{}'::jsonb,
  tutor_data jsonb not null default '{}'::jsonb,
  knowledge_chunks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lectures_video_id_idx on public.lectures (video_id);
