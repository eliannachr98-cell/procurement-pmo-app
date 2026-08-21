-- /api/options?type=authority used to fetch 300 raw (non-distinct)
-- procurements_compact rows matching the ILIKE term and de-duplicate them
-- client-side - for a short/broad term, those 300 rows can all belong to
-- just a handful of high-volume authorities, silently missing plenty of
-- real matches (confirmed live: "ΕΛ" returned only 1 suggestion, "ΕΛΛΗΝΙΚΗ"
-- returned many). A real DISTINCT at the database level, leveraging the
-- existing procurements_compact_authority_trgm_idx GIN trigram index for
-- the ILIKE filter, is both correct and fast - only 1,818 distinct
-- authority names exist in total.
create or replace function public.search_authorities(p_query text)
returns table(authority_name text)
language sql stable as $$
  select distinct p.authority_name
  from public.procurements_compact p
  where p.authority_name ilike '%' || p_query || '%'
  order by p.authority_name
  limit 20;
$$;
