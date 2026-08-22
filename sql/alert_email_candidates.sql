-- Tracks which notices have already triggered an email, so a scheduled
-- sender run never re-notifies about the same ADAM twice.
create table if not exists public.alert_notifications_sent (
  adam text primary key,
  notified_at timestamptz not null default now()
);

-- What's worth emailing about, for the current watchlist/region filter:
--   1. A brand-new Διακήρυξη/Προκήρυξη - a fresh opportunity.
--   2. A Παράταση (extension) for a tender the team already tracks
--      (marked "Υποβλήθηκε" or "Ενδιαφέρον") - the deadline moved on
--      something they care about, everything else (Διευκρίνιση/Απόφαση/
--      Περίληψη/Τροποποίηση) stays in-app only, not worth a fresh email.
-- A single real tender is often announced via BOTH a Διακήρυξη and a
-- Προκήρυξη (confirmed live, see the ΑΔΜΗΕ/Επιμελητήριο Χανίων examples
-- during testing: same authority + budget + title, published the same
-- day) - sending one email per document would be exactly the noise this
-- was built to avoid. The dedup below only collapses a group when it
-- actually mixes declaration+announcement (the confirmed real pattern) -
-- a group of same-titled declarations ALONE (some authorities reuse a
-- generic title like "ΠΡΟΣΚΛΗΣΗ ΥΠΟΒΟΛΗΣ ΠΡΟΣΦΟΡΑΣ" for genuinely
-- different tenders, confirmed live too) is left untouched so distinct
-- tenders never silently disappear.
create extension if not exists pg_trgm;

create or replace function public.alert_email_candidates(p_cpv_codes text[], p_nuts_prefixes text[] default null, p_days int default 14)
returns json
language sql stable as $$
  with watched_notice_adams as (
    select distinct record_adam as adam
    from public.record_cpvs_compact
    where record_type = 'procurement' and cpv_code = any(p_cpv_codes)
  ),
  tracked as (
    select adam from public.alert_submissions
    union
    select adam from public.alert_interests
  ),
  candidates as (
    select p.adam, p.title, p.authority_name, p.document_category, p.publication_date, p.opening_at,
           coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
    from public.procurements_compact p
    join watched_notice_adams w on w.adam = p.adam
    where p.publication_date >= (current_date - (p_days || ' days')::interval)
      and (
        p_nuts_prefixes is null or cardinality(p_nuts_prefixes) = 0
        or exists (select 1 from unnest(p_nuts_prefixes) np where p.nuts_code ilike np || '%')
      )
      and not exists (select 1 from public.alert_notifications_sent s where s.adam = p.adam)
      and (
        p.document_category in ('declaration', 'announcement')
        or (p.document_category = 'extension' and p.adam in (select adam from tracked))
      )
  ),
  -- A ΚΗΜΔΗΣ-generated Διακήρυξη/Προκήρυξη pair for the same tender doesn't
  -- always differ only by a trailing "(Ε.Ε)" suffix - confirmed live one
  -- pair differing in the OPENING words too ("Διακήρυξη για X" vs
  -- "Προκήρυξη στην ΕΕ για X"), which an exact-title match (even
  -- normalized) missed entirely. Trigram similarity() catches this while
  -- still requiring an exact authority+budget match as a guard rail, so a
  -- coincidentally-similar-titled but genuinely different tender doesn't
  -- get merged. A candidate is suppressed only when an EARLIER candidate
  -- (by publication_date, then adam, as a stable tiebreak) already covers
  -- it - the earlier one is what gets emailed.
  declarations as (
    select c.*,
      case when exists (
        select 1 from candidates c2
        where c2.adam <> c.adam
          and c2.document_category in ('declaration', 'announcement')
          and c2.document_category <> c.document_category
          and c2.authority_name is not distinct from c.authority_name
          and c2.budget = c.budget
          and similarity(c2.title, c.title) > 0.4
          and (c2.publication_date, c2.adam) < (c.publication_date, c.adam)
      ) then 0 else 1 end as rn
    from candidates c
    where c.document_category in ('declaration', 'announcement')
  ),
  extensions as (
    select c.*, 1 as rn from candidates c where c.document_category = 'extension'
  ),
  final as (
    select * from declarations where rn = 1
    union all
    select * from extensions
  )
  select coalesce(json_agg(json_build_object(
    'adam', adam,
    'title', title,
    'authority', coalesce(authority_name, '—'),
    'documentType', document_category,
    'publicationDate', publication_date,
    'openingDate', opening_at,
    'budget', budget,
    -- No free-text "description" field exists anywhere in the source data -
    -- the matched CPV description(s) are the closest available stand-in for
    -- "what is this actually for", limited to the CPVs that matched the
    -- watchlist (a notice can carry several unrelated CPVs otherwise).
    'description', (
      select string_agg(distinct rc.cpv_description, '; ')
      from public.record_cpvs_compact rc
      where rc.record_adam = final.adam and rc.record_type = 'procurement'
        and rc.cpv_code = any(p_cpv_codes) and rc.cpv_description is not null
    )
  ) order by publication_date desc nulls last), '[]'::json)
  from final;
$$;
