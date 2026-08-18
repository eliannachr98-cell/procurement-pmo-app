select document_category, count(*)
from public.procurements_compact
where publication_date >= '2026-01-01' and publication_date <= '2026-01-07'
group by 1
order by 2 desc;
