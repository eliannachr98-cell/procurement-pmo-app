-- Related notices of a tender (same authority, publication within a window):
-- the list route looks them up by authority and date range.
create index if not exists procurements_compact_authority_publication_idx
  on public.procurements_compact (authority_name, publication_date);
analyze public.procurements_compact
