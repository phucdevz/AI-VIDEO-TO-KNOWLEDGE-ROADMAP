-- Optional: pipeline / admin evaluation metrics (service role inserts from FastAPI)
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid (),
  created_at timestamptz not null default now (),
  event_type text not null default 'pipeline_run',
  source_url text,
  video_id text,
  lecture_id text,
  provider text,
  latency_ms integer,
  confidence double precision,
  accuracy_score double precision,
  accuracy_s double precision,
  accuracy_t double precision,
  accuracy_k double precision,
  refined boolean default false,
  detail jsonb default '{}'::jsonb
);

create index if not exists system_logs_created_at_idx on public.system_logs (created_at desc);

comment on table public.system_logs is 'AI pipeline runs: latency, provider, accuracy components for admin reporting';
