-- A shared (not per-user) list of CPV codes to watch for new tenders on the
-- Ειδοποιήσεις page. The app has no login system, and this is a
-- single-team internal tool, so there's no need for a user_id column or
-- auth - one shared watchlist is what "who should see this alert" actually
-- means here.
create table if not exists public.cpv_watchlist (
  cpv_code text primary key,
  cpv_label text,
  created_at timestamptz not null default now()
);
