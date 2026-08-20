select document_category,
       count(*) as total,
       count(*) filter (where title ilike '%τροποπ%') as has_word,
       count(*) filter (where title not ilike '%τροποπ%') as missing_word
from public.procurements_compact
where document_category = 'amendment'
group by 1;

select adam, publication_date, title
from public.procurements_compact
where document_category = 'amendment'
  and title not ilike '%τροποπ%'
order by publication_date desc
limit 15;

select adam, publication_date, title
from public.procurements_compact
where document_category = 'amendment'
  and title ilike '%διακήρυξη%'
  and title not ilike '%τροποπ%'
order by publication_date desc
limit 15;
