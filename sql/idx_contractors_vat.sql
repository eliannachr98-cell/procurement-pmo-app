-- Lookups of a contractor by VAT number (followed contractors, profiles) had no
-- index and scanned the whole table.
create index concurrently if not exists record_contractors_compact_vat_idx
  on public.record_contractors_compact (contractor_vat);
