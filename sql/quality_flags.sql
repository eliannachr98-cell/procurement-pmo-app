-- Notice type flags, one row per notice ADAM.
--
-- procurement_quality_flags is filled in two steps after every sync:
--   1. load_notice_types.py (fresh noticeType key, award-reference presence and
--      cancelled flag straight from KHMDHS, rows created for new ADAMs);
--   2. recompute_quality_flags() below.
-- The ONLY rule that decides in_stats is noticeType 3 ("Διακήρυξη"). Amendment,
-- cancelled and date checks are not applied anywhere any more; the columns
-- other_act, cancelled_no_award and date_issue stay in the table but are unused.

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
  set in_stats = (f.notice_type_key = '3'),
      exclusion_reason = case when f.notice_type_key is distinct from '3' then 'type' end,
      rule_version = 'type3_v3',
      computed_at = now()
  where p_from is null
     or f.adam in (select p.adam from public.procurements_compact p where p.publication_date >= p_from);
  get diagnostics affected = row_count;
  return affected;
end;
$$;
