select count(*) as other_count,
       min(publication_date) as earliest,
       max(publication_date) as latest
from public.procurements_compact
where document_category = 'other';

select publication_date, count(*)
from public.procurements_compact
where document_category = 'other'
group by publication_date
order by count(*) desc
limit 15;
