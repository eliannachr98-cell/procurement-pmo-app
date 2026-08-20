-- Lets the team mark a tender (by ADAM) as "this interests us / we're
-- considering participating" - a lighter-weight signal than
-- alert_submissions (see sql/alert_submissions.sql), tracked independently
-- since a tender can be flagged as interesting before any decision to bid
-- has been made, or even without ever submitting. Same shared, no-auth
-- design as alert_submissions and cpv_watchlist.
create table if not exists public.alert_interests (
  adam text primary key,
  marked_at timestamptz not null default now()
);
