-- Customer file additions/edits saved from the dashboard (merged over app/data/customer-file.json).
-- Only the dashboard server writes here, using the project's secret key, which bypasses RLS.
-- RLS is on with no policies and anon/authenticated privileges revoked, so publishable keys can't read or change it.
create table if not exists public.customer_site_edits (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.customer_site_edits enable row level security;
revoke all on table public.customer_site_edits from anon, authenticated;

comment on table public.customer_site_edits is 'Customer file site additions/edits from the B2C work-report dashboard. Server-only (secret key).';
