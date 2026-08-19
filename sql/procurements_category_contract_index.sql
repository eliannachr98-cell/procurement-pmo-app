-- dashboard_breakdown now defaults to document_category = 'declaration' and
-- optionally filters by contract_type (Τύπος σύμβασης on Overview) - with
-- no supporting index this forced a sequential scan over the whole table
-- for broad, low-selectivity values like "Προμήθειες" and timed out.
create index concurrently if not exists procurements_compact_category_contract_idx
  on public.procurements_compact (document_category, contract_type);
