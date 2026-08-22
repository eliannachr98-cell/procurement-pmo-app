-- Tracks which notices have already been emailed to which recipient - PER
-- recipient, not globally. That's what makes a brand-new recipient
-- automatically get a full catch-up of every currently-active match on
-- their very first run (nothing is "sent to them" yet, so nothing is
-- excluded), while an existing recipient only ever sees genuinely new items
-- on later runs - no special-cased "first email" logic needed, it falls out
-- of the per-recipient check on its own.
drop table if exists public.alert_notifications_sent;
create table public.alert_notifications_sent (
  recipient_email text not null,
  adam text not null,
  notified_at timestamptz not null default now(),
  primary key (recipient_email, adam)
);

create extension if not exists pg_trgm;

-- CREATE OR REPLACE can't change a function's parameter list - the earlier
-- version took (cpv_codes, nuts_prefixes, days) with no recipient.
drop function if exists public.alert_email_candidates(text[], text[], int);

-- What's worth emailing to p_recipient_email, for the current watchlist/
-- region filter:
--   1. A brand-new Διακήρυξη/Προκήρυξη that's still ΕΝΕΡΓΟΣ - no award yet,
--      and its submission deadline (opening_at) hasn't passed. This is the
--      same "still open" definition the Ειδοποιήσεις tabs already use, not
--      a publication-date cutoff - a tender the recipient hasn't been told
--      about yet is worth telling them about regardless of when it was
--      first published, and one whose deadline already passed is worth
--      telling NO ONE about, no matter how recently it appeared.
--   2. A Παράταση (extension) for a tender the team already tracks
--      (marked "Υποβλήθηκε" or "Ενδιαφέρον") - the deadline moved on
--      something they care about. Everything else (Διευκρίνιση/Απόφαση/
--      Περίληψη/Τροποποίηση) stays in-app only, not worth a fresh email.
-- p_days bounds how far back to even look, purely so the query doesn't
-- have to scan the entire historical table - the actual "should this be
-- sent" decision is the active-status check above, not this cutoff, so it
-- can stay generous.
--
-- A single real tender is often announced via BOTH a Διακήρυξη and a
-- Προκήρυξη (confirmed live, see the ΑΔΜΗΕ/Επιμελητήριο Χανίων examples
-- during testing: same authority + budget + title, published the same
-- day) - sending one email per document would be exactly the noise this
-- was built to avoid. The dedup below only collapses a group when it
-- actually mixes declaration+announcement (the confirmed real pattern) -
-- a group of same-titled declarations ALONE (some authorities reuse a
-- generic title like "ΠΡΟΣΚΛΗΣΗ ΥΠΟΒΟΛΗΣ ΠΡΟΣΦΟΡΑΣ" for genuinely
-- different tenders, confirmed live too) is left untouched so distinct
-- tenders never silently disappear. Title matching uses trigram
-- similarity(), not exact text, since a real pair's titles don't always
-- differ only by a trailing "(Ε.Ε)" suffix - confirmed live one pair
-- differing in the OPENING words too ("Διακήρυξη για X" vs "Προκήρυξη
-- στην ΕΕ για X").
create or replace function public.alert_email_candidates(p_recipient_email text, p_cpv_codes text[], p_nuts_prefixes text[] default null, p_days int default 365)
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
      and not exists (
        select 1 from public.alert_notifications_sent s
        where s.adam = p.adam and s.recipient_email = p_recipient_email
      )
      and not exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam)
      and (p.opening_at is null or p.opening_at >= now())
      and (
        p.document_category in ('declaration', 'announcement')
        or (p.document_category = 'extension' and p.adam in (select adam from tracked))
      )
  ),
  declarations as (
    select c.*,
      case when exists (
        select 1 from candidates c2
        where c2.adam <> c.adam
          and c2.document_category in ('declaration', 'announcement')
          and c2.authority_name is not distinct from c.authority_name
          and c2.budget = c.budget
          and similarity(c2.title, c.title) > 0.4
          and (
            -- Διακήρυξη always outranks a Προκήρυξη in the same pair,
            -- regardless of which was published first - per explicit
            -- request, whichever one exists preferred is the Διακήρυξη.
            (c2.document_category = 'declaration' and c.document_category = 'announcement')
            -- Within the same type (e.g. two re-issued declarations, or no
            -- declaration at all so two announcements), the earlier one -
            -- by publication_date then adam as a stable tiebreak - wins.
            or (c2.document_category = c.document_category and (c2.publication_date, c2.adam) < (c.publication_date, c.adam))
          )
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
