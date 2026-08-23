select document_category, count(*)
from public.procurements_compact
where publication_date >= '2025-03-05' and publication_date <= '2025-12-31'
group by document_category
order by 2 desc;
