-- =============================================================================
-- AI Video-to-Knowledge — bootstrap Supabase (chạy một lần / khi thiếu schema)
-- =============================================================================
-- Trong Supabase: SQL Editor → dán toàn bộ file → Run.
--
-- • Nếu bảng `lectures` thiếu cột `quiz_data` (và các cột pipeline khác): chạy script
--   này trong SQL Editor, rồi **Settings → API → Reload schema** nếu cần, sau đó **chạy
--   lại pipeline** (POST /extraction/audio hoặc Dashboard "Start pipeline") để lưu quiz
--   và dữ liệu đồ thị vào Supabase.
--
-- • Lỗi hay gặp: `column lectures.quiz_data does not exist`; `user_preferences` not in
--   schema cache — script này bổ sung bảng `user_preferences`, `quiz_results` + ALTER `lectures`.
--
-- Khớp backend `DatabaseService` + Settings + Quiz trên frontend.
-- =============================================================================

-- ── Settings (http://localhost:5173/settings) ─────────────────────────────
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Optional: Realtime (Dashboard shows note in PROGRESS §9)
-- alter publication supabase_realtime add table public.user_preferences;

-- ── Quiz results ───────────────────────────────────────────────────────────
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lecture_id text,
  score numeric not null,
  total_questions int not null,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Lectures pipeline columns ──────────────────────────────────────────────
alter table public.lectures add column if not exists transcript jsonb default '{}'::jsonb;
alter table public.lectures add column if not exists flow_data jsonb default '{"nodes":[],"edges":[]}'::jsonb;
alter table public.lectures add column if not exists quiz_data jsonb default '{"questions":[]}'::jsonb;
alter table public.lectures add column if not exists tutor_data jsonb default '{"summary":"","key_points":[]}'::jsonb;
alter table public.lectures add column if not exists knowledge_chunks jsonb default '[]'::jsonb;
alter table public.lectures add column if not exists status text default 'ready';
alter table public.lectures add column if not exists user_id uuid references auth.users (id) on delete set null;

-- Sau khi chạy: Supabase Dashboard → Settings → API → Reload schema (nếu cache PostgREST chưa thấy cột mới).
