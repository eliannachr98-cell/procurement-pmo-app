-- Email addresses that should receive a notification when a new tender
-- matches a watched CPV. No user_id column - same shared, no-auth design as
-- cpv_watchlist, since this is a single-team internal tool.
create table if not exists public.alert_recipients (
  email text primary key,
  created_at timestamptz not null default now()
);
