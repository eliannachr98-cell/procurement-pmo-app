select document_category, count(*)
from public.procurements_compact
where publication_date between '2025-03-05' and '2025-03-11'
group by document_category
order by count(*) desc;
