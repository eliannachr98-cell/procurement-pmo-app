select p.adam, p.publication_date::text as published, p.cancelled_at is not null as cancelled_at, p.status as raw_status, f.cancelled_api, left(p.title, 60) as title
from public.procurements_compact p join public.procurement_quality_flags f on f.adam = p.adam
where f.notice_type_key = '3' and p.document_category = 'declaration' and p.publication_date >= '2025-01-01' and p.publication_date < '2026-01-01'
  and f.cancelled_api and p.cancelled_at is null and p.status <> 'cancelled'
  and not exists (select 1 from public.awards_compact a where a.procurement_adam = p.adam)
order by p.adam
