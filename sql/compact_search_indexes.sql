create extension if not exists pg_trgm;

create index concurrently if not exists record_contractors_compact_name_trgm_idx
  on public.record_contractors_compact
  using gin (contractor_name gin_trgm_ops);

create index concurrently if not exists record_cpvs_compact_description_trgm_idx
  on public.record_cpvs_compact
  using gin (cpv_description gin_trgm_ops);

analyze public.record_contractors_compact;
analyze public.record_cpvs_compact;
