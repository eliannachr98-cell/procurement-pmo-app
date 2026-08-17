-- Lets the team mark a tender (by ADAM) as "we've already submitted an
-- offer for this" so it stays visually distinct in the alert feed. No
-- user_id column - same shared, no-auth design as cpv_watchlist, since
-- this is a single-team internal tool.
create table if not exists public.alert_submissions (
  adam text primary key,
  marked_at timestamptz not null default now()
);
