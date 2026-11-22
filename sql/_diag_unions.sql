with base as (
  select p.adam, extract(year from p.publication_date)::int as year, p.cancelled_at, p.status, f.cancelled_api,
         exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam) as has_award,
         exists (select 1 from public.contracts_compact c where c.procurement_adam = p.adam) as has_contract_direct
  from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
  where f.notice_type_key = '3' and p.document_category = 'declaration' and p.publication_date >= '2024-01-01' and p.publication_date < '2026-01-01'
)
select year, count(*) as tenders_excel_kept,
       count(*) filter (where cancelled_at is not null) as cancelled_flag,
       count(*) filter (where cancelled_at is not null and not has_award) as excel_rule_cancelled_no_award,
       count(*) filter (where cancelled_at is not null and not has_award and not has_contract_direct) as also_no_contract,
       count(*) filter (where (cancelled_at is not null or cancelled_api) and not has_award) as with_cancelled_api,
       count(*) filter (where status = 'cancelled' and not has_award) as status_rule
from base group by year order by year;
select cache_key, payload->'total' as total, payload->'status' as status from public.dashboard_cache where cache_key in ('2024', '2025') order by cache_key
