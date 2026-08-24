-- Paid-tier feature: named, saved filter combinations (year, authority,
-- contractor, cpv, contract type, document type, status) shared across
-- Επισκόπηση/Διαγωνισμοί/Αγορά - lets a logged-in team member jump straight
-- back to a filter set they use often instead of rebuilding it every visit.
-- Same access pattern as the other team tables: RLS allows the
-- anon/publishable key to read and write, gated at the API route level via
-- ALERT_ACCESS_CODE instead of a Postgres-level user.
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.saved_views enable row level security;

drop policy if exists "saved_views_select" on public.saved_views;
create policy "saved_views_select" on public.saved_views for select using (true);

drop policy if exists "saved_views_insert" on public.saved_views;
create policy "saved_views_insert" on public.saved_views for insert with check (true);

drop policy if exists "saved_views_delete" on public.saved_views;
create policy "saved_views_delete" on public.saved_views for delete using (true);
