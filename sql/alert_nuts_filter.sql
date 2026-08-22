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

-- Some NUTS names in the KHMDHS source data are typed with Latin letters
-- that are visually identical to their Greek counterparts (confirmed live:
-- EL3's name "ATTIKΗ" starts with a Latin "A", and EL30's "Aττική" too - a
-- plain ILIKE search for the Greek word "Αττική" silently misses both,
-- which happen to be the two broadest Attica codes that matter most for a
-- one-click "all of Attica" pick). This folds the common look-alike Latin
-- uppercase letters onto their Greek equivalents, and strips Greek accents,
-- before comparing - applied to both the stored name and the search term,
-- so it doesn't matter which script (or accenting) either one used.
create or replace function public.normalize_gr(value text)
returns text
language sql immutable as $$
  select translate(
    upper(value),
    'ΆΈΉΊΌΎΏΪΫABEZHIKMNOPTYX',
    'ΑΕΗΙΟΥΩΙΥΑΒΕΖΗΙΚΜΝΟΡΤΥΧ'
  );
$$;

create or replace function public.search_nuts(p_query text)
returns table(nuts_code text, nuts_name text)
language sql stable as $$
  select distinct p.nuts_code, p.nuts_name
  from public.procurements_compact p
  where p.nuts_code is not null and p.nuts_name is not null
    and public.normalize_gr(p.nuts_name) ilike '%' || public.normalize_gr(p_query) || '%'
  order by p.nuts_name
  limit 20;
$$;
