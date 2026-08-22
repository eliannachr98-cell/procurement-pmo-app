-- Server-side query for the Ειδοποιήσεις CPV alert feed.
--
-- The first version of this resolved each watched CPV through
-- procurementAdamsForContractor-style helpers (built for the market/
-- dashboard routes, which walk every award/contract ever tagged with that
-- CPV across all time) and then paged the results back through PostgREST in
-- chunks of 70 - fine for one narrow CPV, but a handful of broad codes
-- (e.g. "79400000-8" general business consulting) made this fan out into
-- hundreds of sequential HTTP round trips and time out. This does the whole
-- thing as one inlined query instead, restricted up front to a recent
-- publication window rather than resolving matches across the entire
-- history first.
--
-- Every document_category is returned (not just declaration/announcement) -
-- an extension ("Παράταση / μετάθεση") or amendment notice for a watched CPV
-- is still something the user wants to see, just filterable client-side:
-- collapsing them server-side hid real information (e.g. a postponed
-- opening date) with no way to get it back.
-- p_nuts_prefixes is optional - when set, a notice's own nuts_code must
-- start with one of the given prefixes (e.g. "EL3" covers every Attica
-- sub-region: EL30, EL301..EL307) to be included. Null/empty means no
-- region restriction, same as before this filter existed.
create or replace function public.alerts_feed(p_cpv_codes text[], p_days int default 45, p_nuts_prefixes text[] default null)
returns json
language sql stable as $$
  with matched_notice_adams as (
    select distinct record_adam as adam
    from public.record_cpvs_compact
    where record_type = 'procurement' and cpv_code = any(p_cpv_codes)
  ),
  notices as (
    select p.adam, p.title, p.authority_name, p.contract_type, p.document_category, p.publication_date, p.opening_at,
           coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
    from public.procurements_compact p
    join matched_notice_adams m on m.adam = p.adam
    where p.publication_date >= (current_date - (p_days || ' days')::interval)
      and (
        p_nuts_prefixes is null or cardinality(p_nuts_prefixes) = 0
        or exists (select 1 from unnest(p_nuts_prefixes) np where p.nuts_code ilike np || '%')
      )
  ),
  notice_cpvs as (
    select rc.record_adam as adam, rc.cpv_code, rc.cpv_description
    from public.record_cpvs_compact rc
    join notices n on n.adam = rc.record_adam
    where rc.record_type = 'procurement'
  ),
  -- A notice's own opening/deadline date is sometimes stale (ΚΗΜΔΗΣ never
  -- updates it once the tender moves on), so a tender that already has an
  -- award can still show a future "Αποσφράγιση" and read as still open -
  -- confirmed live against 26PROC018595288 (deadline shown as 2026-12-31,
  -- awarded and under contract since 2026-03-12). The frontend uses this
  -- flag to always bucket such tenders as concluded (Ανενεργοί), regardless
  -- of what opening_at says.
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
    'matchedCpv', (select coalesce(json_agg(nc.cpv_code), '[]'::json) from notice_cpvs nc where nc.adam = n.adam and nc.cpv_code = any(p_cpv_codes))
  ) order by n.publication_date desc nulls last), '[]'::json)
  from notices n
  left join has_award ha on ha.adam = n.adam;
$$;
