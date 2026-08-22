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

-- CREATE OR REPLACE can't change a function's return columns - the earlier
-- version returned only (nuts_code, nuts_name).
drop function if exists public.search_nuts(text);

-- Greek NUTS regions nest at 3 precision levels (EL3 -> EL30 -> EL301..307),
-- and KHMDHS tags different notices at different levels for the "same" real
-- region - a plain name search surfaces "ΑΤΤΙΚΗ", "Αττική", "Ανατολική
-- Αττική" side by side with no way to tell a whole-region pick from a
-- sub-region one (confirmed confusing live: a second person using this has
-- no way to know EL3 is the complete, safe choice and EL30/EL301.. are
-- narrower). total_count simulates what selecting this exact code would
-- actually filter to (prefix match, same as alerts_feed uses) rather than
-- the raw exact-tag count, which is often smaller for the broad codes since
-- most notices get tagged at the more precise sub-level. is_broad is true
-- when no shorter sibling among the other matches already covers this one -
-- the frontend uses it to label the whole-region pick explicitly instead of
-- leaving that inferred from code length alone.
create or replace function public.search_nuts(p_query text)
returns table(nuts_code text, nuts_name text, total_count bigint, is_broad boolean)
language sql stable as $$
  with matches as (
    select distinct p.nuts_code, p.nuts_name
    from public.procurements_compact p
    where p.nuts_code is not null and p.nuts_name is not null
      and public.normalize_gr(p.nuts_name) ilike '%' || public.normalize_gr(p_query) || '%'
  ),
  counted as (
    select m.nuts_code, m.nuts_name,
           (select count(*) from public.procurements_compact p2 where p2.nuts_code ilike m.nuts_code || '%') as total_count
    from matches m
  )
  select c.nuts_code, c.nuts_name, c.total_count,
         not exists (
           select 1 from matches other
           where other.nuts_code <> c.nuts_code
             and length(other.nuts_code) < length(c.nuts_code)
             and c.nuts_code ilike other.nuts_code || '%'
         ) as is_broad
  from counted c
  order by length(c.nuts_code), c.nuts_name
  limit 20;
$$;
