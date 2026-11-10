-- Contractors ("ανταγωνιστές") and authorities a profile follows, next to the
-- CPV list (cpv_watchlist) and regions (alert_nuts_filter). Same access pattern
-- as those tables: team-scoped rows read and written through the API.
create table if not exists public.contractor_watchlist (
  team_id uuid not null references public.teams(id) on delete cascade,
  contractor_key text not null,
  contractor_label text,
  created_at timestamptz not null default now(),
  primary key (team_id, contractor_key)
);

create table if not exists public.authority_watchlist (
  team_id uuid not null references public.teams(id) on delete cascade,
  authority_name text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, authority_name)
);
