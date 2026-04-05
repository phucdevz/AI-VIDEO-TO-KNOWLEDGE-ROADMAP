-- Run in Supabase SQL editor (once).
-- Khớp backend `DatabaseService` — khóa upsert là `video_url` (URL YouTube), không phải `video_id`.

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  video_url text not null unique,
  title text,
  transcript jsonb not null default '{}'::jsonb,
  flow_data jsonb not null default '{}'::jsonb,
  quiz jsonb not null default '{"questions":[]}'::jsonb,
  quiz_data jsonb,
  summary text default '',
  tutor_data jsonb,
  knowledge_chunks jsonb not null default '[]'::jsonb,
  status text default 'ready',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index trùng unique trên video_url là tùy chọn; giữ để query nhanh.
create index if not exists lectures_video_url_idx on public.lectures (video_url);
