-- ClickUp report snapshots, their sync log, and the AI summary cache.
-- Written only by the app's server code with the secret key: RLS on, no policies, no anon/authenticated grants.

-- Latest snapshot per report (1 = CX, 2 = Dev). payload_gzip is the gzip+base64 JSON the dashboard renders.
create table if not exists public.clickup_snapshots (
  id smallint primary key,
  kind text not null check (kind in ('cx', 'dev')),
  payload_gzip text not null,
  schema_version int,
  synced_at timestamptz not null,
  task_count int,
  partial boolean not null default false,
  size_bytes int not null,
  updated_at timestamptz not null default now()
);

-- One row per refresh attempt (success or failure), for auditing sync health.
create table if not exists public.clickup_sync_runs (
  id bigint generated always as identity primary key,
  snapshot_id smallint not null,
  kind text,
  ok boolean not null,
  trigger text,
  mode text,
  task_count int,
  delta_count int,
  partial boolean,
  size_bytes int,
  synced_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists clickup_sync_runs_snapshot_created_idx on public.clickup_sync_runs (snapshot_id, created_at desc);

-- Verified AI summary text keyed by sha256(kind, models, prompt).
create table if not exists public.ai_summaries (
  key text primary key,
  kind text not null,
  model text,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.clickup_snapshots enable row level security;
alter table public.clickup_sync_runs enable row level security;
alter table public.ai_summaries enable row level security;

revoke all on public.clickup_snapshots from anon, authenticated;
revoke all on public.clickup_sync_runs from anon, authenticated;
revoke all on public.ai_summaries from anon, authenticated;

comment on table public.clickup_snapshots is 'Latest ClickUp report snapshot per report (1 = CX, 2 = Dev), gzip+base64 JSON. Server-only (secret key).';
comment on table public.clickup_sync_runs is 'ClickUp refresh log (success and failure). Server-only (secret key).';
comment on table public.ai_summaries is 'Verified Groq summary text cache keyed by sha256(kind, models, prompt). Server-only (secret key).';
