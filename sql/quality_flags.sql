-- Quality flags for the thesis Excel rules, one row per notice ADAM.
--
-- procurement_quality_flags is filled in two steps after every sync:
--   1. load_notice_types.py (fresh noticeType key, award-reference presence and
--      cancelled flag straight from KHMDHS, rows created for new ADAMs);
--   2. recompute_quality_flags() below, which applies the Excel rules:
--        - only noticeType 3 ("Διακήρυξη") counts;
--        - titles with amendment/extension/... keywords are excluded
--          (accent-insensitive, as the Excel behaves in practice);
--        - a cancelled notice without an award reference is excluded;
--        - an opening date before publication or over 365 days after is excluded.
-- in_stats is true only when none of those exclude the notice.

create table if not exists public.procurement_quality_flags (
  adam text primary key,
  other_act boolean not null default false,
  cancelled_no_award boolean not null default false,
  date_issue boolean not null default false,
  in_stats boolean not null default false,
  exclusion_reason text,
  rule_version text not null default 'excel_v1',
  computed_at timestamptz not null default now(),
  notice_type_key text,
  has_award_ref boolean,
  cancelled_api boolean
);

create or replace function public.recompute_quality_flags(p_from date default null)
returns integer
language plpgsql as $$
declare
  affected integer;
begin
  update public.procurement_quality_flags f
  set other_act = t.other_act,
      cancelled_no_award = t.cna,
      date_issue = t.di,
      in_stats = (f.notice_type_key = '3') and not (t.other_act or t.cna or t.di),
      exclusion_reason = case
        when f.notice_type_key is distinct from '3' then 'type'
        when t.other_act then 'title'
        when t.cna then 'cancelled_no_award'
        when t.di then 'dates'
      end,
      rule_version = 'excel_v2',
      computed_at = now()
  from (
    select p.adam,
           translate(upper(p.title), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') ~ 'ΑΠΟΦΑΣ|ΤΡΟΠΟΠ|ΠΑΡΑΤΑΣ|ΔΙΕΥΚΡ|ΜΑΤΑΙΩ|ΔΙΟΡΘΩ|ΑΝΑΡΤΗΣ|ΠΕΡΙΛΗΨ|ΜΕΤΑΘΕΣ|ΠΡΟΣΦΥΓ|ΑΕΠΠ' as other_act,
           (coalesce(g.cancelled_api, p.status = 'cancelled')
             and not coalesce(g.has_award_ref, exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam))) as cna,
           coalesce(
             (p.opening_at at time zone 'Europe/Athens')::date < p.publication_date
             or (p.opening_at at time zone 'Europe/Athens')::date - p.publication_date > 365,
             false) as di
    from public.procurements_compact p
    join public.procurement_quality_flags g on g.adam = p.adam
    where p_from is null or p.publication_date >= p_from
  ) t
  where f.adam = t.adam;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
