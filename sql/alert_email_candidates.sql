-- Tracks which notices have already been emailed to which recipient - PER
-- recipient, not globally. That's what makes a brand-new recipient
-- automatically get a full catch-up of every currently-active match on
-- their very first run (nothing is "sent to them" yet, so nothing is
-- excluded), while an existing recipient only ever sees genuinely new items
-- on later runs - no special-cased "first email" logic needed, it falls out
-- of the per-recipient check on its own.
-- (One-off migration from the earlier adam-only-PK version already ran -
-- kept as create-if-not-exists from here on so re-applying this file for a
-- future logic tweak can never again silently wipe real send history.)
create table if not exists public.alert_notifications_sent (
  recipient_email text not null,
  adam text not null,
  notified_at timestamptz not null default now(),
  primary key (recipient_email, adam)
);

create extension if not exists pg_trgm;

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
  submitted_adams as (
    select adam from public.alert_submissions
  ),
  interested_adams as (
    select adam from public.alert_interests
  ),
  tracked as (
    select adam from submitted_adams
    union
    select adam from interested_adams
  ),
  candidates as (
    -- tracked_adam is which adam counts for the isSubmitted/isInterested
    -- check below: for a normal notice that's itself (ΚΗΜΔΗΣ keeps a
    -- tender's extension/amendment notices under the same ADAM as the
    -- original), but award_candidates below overrides this to the award's
    -- procurement_adam since an award record has its own, different ADAM.
    select p.adam, p.adam as tracked_adam, p.title, p.authority_name, p.document_category, p.publication_date, p.opening_at,
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
  -- A Προκήρυξη is suppressed whenever a matching Διακήρυξη exists AT ALL in
  -- procurements_compact - not just among this run's still-unsent
  -- candidates. Scoping the check to `candidates` was the original bug: once
  -- the paired Διακήρυξη got emailed and recorded in
  -- alert_notifications_sent, it dropped out of `candidates` on the very
  -- next run, so this check stopped seeing the pair and the previously (and
  -- correctly) suppressed Προκήρυξη resurfaced as if it were new - confirmed
  -- live 2026-08-23 (ΔΗΜΟΣ ΗΛΙΟΥΠΟΛΗΣ, ΕΕΣΥΠ, ΜΕΤΑΞΑ notices). Checking the
  -- full table instead makes the suppression permanent regardless of what's
  -- already been sent.
  declarations as (
    select c.*,
      case when c.document_category = 'announcement' and exists (
        select 1 from public.procurements_compact d
        where d.adam <> c.adam
          and d.document_category = 'declaration'
          and d.authority_name is not distinct from c.authority_name
          and coalesce(d.budget_inc_vat, d.budget_ex_vat, d.budget_unknown_vat, 0) = c.budget
          and similarity(d.title, c.title) > 0.4
      ) then 0
      -- Among same-category candidates only (e.g. two re-issued
      -- declarations, or two announcements with no declaration at all), the
      -- earlier one - by publication_date then adam as a stable tiebreak -
      -- wins. This still only compares against `candidates` since both
      -- sides of a same-category tie are equally eligible to be "the one
      -- that gets sent", unlike the cross-category case above.
      when exists (
        select 1 from candidates c2
        where c2.adam <> c.adam
          and c2.document_category = c.document_category
          and c2.authority_name is not distinct from c.authority_name
          and c2.budget = c.budget
          and similarity(c2.title, c.title) > 0.4
          and (c2.publication_date, c2.adam) < (c.publication_date, c.adam)
      ) then 0
      else 1 end as rn
    from candidates c
    where c.document_category in ('declaration', 'announcement')
  ),
  extensions as (
    select c.*, 1 as rn from candidates c where c.document_category = 'extension'
  ),
  -- Ανάδοχος notifications: not scoped to the CPV/region watchlist at all
  -- (unlike declarations/announcements/extensions above) - a tender the team
  -- already submitted on or is considering stays worth an award update
  -- regardless of whether it's still on the current watchlist. Cancelled
  -- awards (cancelled_at is not null) don't count as "a contractor came
  -- out".
  award_candidates as (
    select a.adam, a.procurement_adam as tracked_adam, coalesce(p.title, a.title) as title,
           coalesce(p.authority_name, a.authority_name) as authority_name,
           'award'::text as document_category, a.award_date as publication_date,
           null::timestamptz as opening_at,
           coalesce(a.amount_inc_vat, a.amount_ex_vat, a.amount_unknown_vat, 0) as budget,
           1 as rn
    from public.awards_compact a
    left join public.procurements_compact p on p.adam = a.procurement_adam
    where a.procurement_adam in (select adam from tracked)
      and a.cancelled_at is null
      and not exists (
        select 1 from public.alert_notifications_sent s
        where s.adam = a.adam and s.recipient_email = p_recipient_email
      )
  ),
  final as (
    select * from declarations where rn = 1
    union all
    select * from extensions
    union all
    select * from award_candidates
  )
  select coalesce(json_agg(json_build_object(
    'adam', adam,
    'title', title,
    'authority', coalesce(authority_name, '—'),
    'documentType', document_category,
    'publicationDate', publication_date,
    'openingDate', opening_at,
    'budget', budget,
    -- Only meaningful for a 'extension' row (a new declaration/announcement
    -- is by definition not yet tracked by anyone) - lets the email put
    -- updates on tenders we've submitted or are considering into their own
    -- sections instead of one flat list. Both can be true at once (the two
    -- toggles in the app aren't mutually exclusive), so a row can land in
    -- both sections.
    'isSubmitted', (tracked_adam in (select adam from submitted_adams)),
    'isInterested', (tracked_adam in (select adam from interested_adams)),
    -- No free-text "description" field exists anywhere in the source data -
    -- the matched CPV description(s) are the closest available stand-in for
    -- "what is this actually for", limited to the CPVs that matched the
    -- watchlist (a notice can carry several unrelated CPVs otherwise). Not
    -- meaningful for an award row (CPVs are attached to the original
    -- procurement's adam, not the award's own adam) - contractors below
    -- fills that role instead.
    'description', (
      select string_agg(distinct rc.cpv_description, '; ')
      from public.record_cpvs_compact rc
      where rc.record_adam = final.adam and rc.record_type = 'procurement'
        and rc.cpv_code = any(p_cpv_codes) and rc.cpv_description is not null
    ),
    -- Only populated for an 'award' row.
    'contractors', (
      case when document_category = 'award' then (
        select string_agg(rc.contractor_name, ', ' order by rc.position)
        from public.record_contractors_compact rc
        where rc.record_adam = final.adam and rc.record_type = 'award'
      ) else null end
    )
  ) order by publication_date desc nulls last), '[]'::json)
  from final;
$$;
