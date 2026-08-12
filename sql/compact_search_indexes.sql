create extension if not exists pg_trgm;

create index concurrently if not exists record_contractors_compact_name_trgm_idx
  on public.record_contractors_compact
  using gin (contractor_name gin_trgm_ops);

create index concurrently if not exists record_cpvs_compact_description_trgm_idx
  on public.record_cpvs_compact
  using gin (cpv_description gin_trgm_ops);

-- dashboard_breakdown()/procurement route ILIKE '%text%' searches on these
-- two columns were falling back to a full sequential scan of
-- procurements_compact (~290k rows, 3-4s alone) since a plain btree index
-- cannot serve a leading-wildcard pattern.
create index concurrently if not exists procurements_compact_authority_trgm_idx
  on public.procurements_compact
  using gin (authority_name gin_trgm_ops);

create index concurrently if not exists procurements_compact_title_trgm_idx
  on public.procurements_compact
  using gin (title gin_trgm_ops);

analyze public.record_contractors_compact;
analyze public.record_cpvs_compact;
analyze public.procurements_compact;
