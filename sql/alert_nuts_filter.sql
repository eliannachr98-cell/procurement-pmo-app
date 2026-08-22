-- Persisted region (NUTS) filter for the Ειδοποιήσεις CPV alert feed - same
-- shape/pattern as cpv_watchlist. A selected nuts_code is matched as a
-- PREFIX against every notice's own nuts_code in alerts_feed(), so picking
-- the broad top-level code (e.g. "EL3" / ΑΤΤΙΚΗ) also covers every narrower
-- sub-region under it (EL301..EL307) without needing to select each one.
create table if not exists public.alert_nuts_filter (
  nuts_code text primary key,
  nuts_name text,
  created_at timestamptz not null default now()
);

create or replace function public.search_nuts(p_query text)
returns table(nuts_code text, nuts_name text)
language sql stable as $$
  select distinct p.nuts_code, p.nuts_name
  from public.procurements_compact p
  where p.nuts_code is not null and p.nuts_name is not null
    and p.nuts_name ilike '%' || p_query || '%'
  order by p.nuts_name
  limit 20;
$$;
