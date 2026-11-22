select p.adam, p.document_category, p.publication_date::text as published, f.notice_type_key, p.cancelled_at is not null as cancelled_at, left(p.title, 90) as title, p.status
from public.procurements_compact p left join public.procurement_quality_flags f on f.adam = p.adam
where p.adam in ('24PROC015883787', '24PROC016074021')
union all
select adam, 'MISSING in procurements_compact', null, null, null, null, null from (values ('24PROC015883787'), ('24PROC016074021')) v(adam) where adam not in (select adam from public.procurements_compact)
union all
select 'awards in DB by year of notice', extract(year from p.publication_date)::text, count(distinct a.procurement_adam)::text, null, null, null, null
from public.awards_compact a join public.procurements_compact p on p.adam = a.procurement_adam where p.publication_date >= '2024-01-01' group by extract(year from p.publication_date)
