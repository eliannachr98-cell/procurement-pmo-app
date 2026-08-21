-- Fetches specific notices by ADAM, independent of any CPV watchlist scope
-- or publication-date window - unlike alerts_feed(), which only returns
-- notices matching the *current* watchlist within a recent window. The
-- Ειδοποιήσεις page's "Υποβεβλημένες προσφορές"/"Ενδιαφέρον για συμμετοχή"
-- lists are the user's own personal tracking, not tied to what CPVs happen
-- to be watched right now - fetching by ADAM directly means removing a CPV
-- from the watchlist (or clearing it entirely) can no longer make an
-- already-tracked tender silently vanish from those lists.
--
-- matchedCpv is always empty here (there's no watchlist to match against) -
-- the frontend already falls back to showing every CPV on the notice when
-- matchedCpv is empty, which is exactly what's wanted in this context.
create or replace function public.tenders_by_adam(p_adams text[])
returns json
language sql stable as $$
  with notices as (
    select p.adam, p.title, p.authority_name, p.contract_type, p.document_category, p.publication_date, p.opening_at,
           coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
    from public.procurements_compact p
    where p.adam = any(p_adams)
  ),
  notice_cpvs as (
    select rc.record_adam as adam, rc.cpv_code, rc.cpv_description
    from public.record_cpvs_compact rc
    join notices n on n.adam = rc.record_adam
    where rc.record_type = 'procurement'
  ),
  has_award as (
    select distinct a.procurement_adam as adam
    from public.awards_compact a
    where a.procurement_adam in (select adam from notices)
  )
  select coalesce(json_agg(json_build_object(
    'adam', n.adam,
    'title', n.title,
    'authority', coalesce(n.authority_name, '—'),
    'contractType', n.contract_type,
    'documentType', n.document_category,
    'publicationDate', n.publication_date,
    'openingDate', n.opening_at,
    'budget', n.budget,
    'hasAward', (ha.adam is not null),
    'cpvs', (select coalesce(json_agg(json_build_object('code', nc.cpv_code, 'description', nc.cpv_description)), '[]'::json) from notice_cpvs nc where nc.adam = n.adam),
    'matchedCpv', '[]'::json
  ) order by n.publication_date desc nulls last), '[]'::json)
  from notices n
  left join has_award ha on ha.adam = n.adam;
$$;
