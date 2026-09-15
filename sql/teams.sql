-- Self-service teams: replaces the single hardcoded ALERT_ACCESS_CODE env
-- var with a real table of teams, each with its own passcode chosen at
-- signup. Every table that used to be one shared, global profile
-- (cpv_watchlist, alert_nuts_filter, alert_submissions, alert_interests,
-- alert_recipients, saved_views) gets a team_id column so each team's data
-- stays isolated from every other team's.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  passcode text not null unique,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;

drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select using (true);

drop policy if exists "teams_insert" on public.teams;
create policy "teams_insert" on public.teams for insert with check (true);

drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams for update using (true) with check (true);

-- Step 1 of the migration: create the first team from the existing shared
-- passcode, so nobody currently using the app loses access or data.
-- Replace '<CURRENT_ALERT_ACCESS_CODE>' below with the real value of the
-- ALERT_ACCESS_CODE environment variable (Vercel dashboard -> Settings ->
-- Environment Variables) before running this file.
insert into public.teams (name, passcode)
values ('Αρχική ομάδα', '<CURRENT_ALERT_ACCESS_CODE>')
on conflict (passcode) do nothing;

-- Step 2: add team_id to every previously-global table, backfill it to the
-- first team above, then lock it down (not null + part of the primary key).
do $$
declare
  first_team_id uuid;
begin
  select id into first_team_id from public.teams where name = 'Αρχική ομάδα' limit 1;

  -- cpv_watchlist
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='cpv_watchlist' and column_name='team_id') then
    alter table public.cpv_watchlist add column team_id uuid references public.teams(id) on delete cascade;
    update public.cpv_watchlist set team_id = first_team_id where team_id is null;
    alter table public.cpv_watchlist alter column team_id set not null;
    alter table public.cpv_watchlist drop constraint if exists cpv_watchlist_pkey;
    alter table public.cpv_watchlist add primary key (team_id, cpv_code);
  end if;

  -- alert_nuts_filter
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='alert_nuts_filter' and column_name='team_id') then
    alter table public.alert_nuts_filter add column team_id uuid references public.teams(id) on delete cascade;
    update public.alert_nuts_filter set team_id = first_team_id where team_id is null;
    alter table public.alert_nuts_filter alter column team_id set not null;
    alter table public.alert_nuts_filter drop constraint if exists alert_nuts_filter_pkey;
    alter table public.alert_nuts_filter add primary key (team_id, nuts_code);
  end if;

  -- alert_submissions
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='alert_submissions' and column_name='team_id') then
    alter table public.alert_submissions add column team_id uuid references public.teams(id) on delete cascade;
    update public.alert_submissions set team_id = first_team_id where team_id is null;
    alter table public.alert_submissions alter column team_id set not null;
    alter table public.alert_submissions drop constraint if exists alert_submissions_pkey;
    alter table public.alert_submissions add primary key (team_id, adam);
  end if;

  -- alert_interests
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='alert_interests' and column_name='team_id') then
    alter table public.alert_interests add column team_id uuid references public.teams(id) on delete cascade;
    update public.alert_interests set team_id = first_team_id where team_id is null;
    alter table public.alert_interests alter column team_id set not null;
    alter table public.alert_interests drop constraint if exists alert_interests_pkey;
    alter table public.alert_interests add primary key (team_id, adam);
  end if;

  -- alert_recipients
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='alert_recipients' and column_name='team_id') then
    alter table public.alert_recipients add column team_id uuid references public.teams(id) on delete cascade;
    update public.alert_recipients set team_id = first_team_id where team_id is null;
    alter table public.alert_recipients alter column team_id set not null;
    alter table public.alert_recipients drop constraint if exists alert_recipients_pkey;
    alter table public.alert_recipients add primary key (team_id, email);
  end if;

  -- saved_views (id is already a uuid primary key on its own - team_id just
  -- gets added as a plain not-null column, no primary key change needed)
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='saved_views' and column_name='team_id') then
    alter table public.saved_views add column team_id uuid references public.teams(id) on delete cascade;
    update public.saved_views set team_id = first_team_id where team_id is null;
    alter table public.saved_views alter column team_id set not null;
  end if;
end $$;
