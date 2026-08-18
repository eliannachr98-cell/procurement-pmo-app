with days as (
  select generate_series('2025-01-01'::date, current_date, '1 day'::interval)::date as day
),
notice_counts as (
  select publication_date::date as day, count(*) as n from public.procurements_compact where publication_date >= '2025-01-01' group by 1
),
award_counts as (
  select award_date::date as day, count(*) as n from public.awards_compact where award_date >= '2025-01-01' group by 1
),
contract_counts as (
  select signed_date::date as day, count(*) as n from public.contracts_compact where signed_date >= '2025-01-01' group by 1
)
select
  count(*) filter (where coalesce(nc.n,0) = 0 and extract(dow from d.day) not in (0,6)) as notice_zero_weekdays,
  count(*) filter (where coalesce(ac.n,0) = 0 and extract(dow from d.day) not in (0,6)) as award_zero_weekdays,
  count(*) filter (where coalesce(cc.n,0) = 0 and extract(dow from d.day) not in (0,6)) as contract_zero_weekdays,
  count(*) as total_days_checked
from days d
left join notice_counts nc on nc.day = d.day
left join award_counts ac on ac.day = d.day
left join contract_counts cc on cc.day = d.day;

with days as (
  select generate_series('2025-01-01'::date, current_date, '1 day'::interval)::date as day
),
notice_counts as (
  select publication_date::date as day, count(*) as n from public.procurements_compact where publication_date >= '2025-01-01' group by 1
)
select d.day, coalesce(nc.n,0) as notices
from days d
left join notice_counts nc on nc.day = d.day
where coalesce(nc.n,0) = 0 and extract(dow from d.day) not in (0,6)
order by d.day
limit 60;
