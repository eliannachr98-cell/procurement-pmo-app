select extract(year from p.publication_date)::int as year, count(*) as n,
       string_agg(p.adam || '|' || to_char(p.publication_date, 'YYYY-MM-DD') || '|' || (case when p.cancelled_at is not null then 1 else 0 end) || '|' || (case when f.cancelled_api then 1 else 0 end) || '|' ||
                  (case when exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam) then 1 else 0 end) || '|' || p.document_category, ';' order by p.adam) as lst
from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
where f.notice_type_key = '3' and p.publication_date >= '2024-01-01' and p.publication_date < '2026-01-01'
group by 1 order by 1
