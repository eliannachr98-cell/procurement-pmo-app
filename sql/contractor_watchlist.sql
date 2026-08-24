-- Persists the team's Ανάδοχος sidebar filter selections (Overview/Tenders/
-- Αγορά), the same way cpv_watchlist already persists the Ειδοποιήσεις CPV
-- picks - survives a real refresh/new session once logged in, not just
-- kept in memory for the current tab. Same access pattern: RLS allows the
-- anon/publishable key to read and write, gated at the API route level via
-- ALERT_ACCESS_CODE instead of a Postgres-level user.
create table if not exists public.contractor_watchlist (
  contractor_value text primary key,
  created_at timestamptz not null default now()
);

alter table public.contractor_watchlist enable row level security;

drop policy if exists "contractor_watchlist_select" on public.contractor_watchlist;
create policy "contractor_watchlist_select" on public.contractor_watchlist for select using (true);

drop policy if exists "contractor_watchlist_insert" on public.contractor_watchlist;
create policy "contractor_watchlist_insert" on public.contractor_watchlist for insert with check (true);

drop policy if exists "contractor_watchlist_delete" on public.contractor_watchlist;
create policy "contractor_watchlist_delete" on public.contractor_watchlist for delete using (true);
