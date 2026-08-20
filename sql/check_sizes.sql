select count(*) as false_positive_repair
from public.procurements_compact
where document_category = 'amendment'
  and title ilike '%επιδιόρθωσ%';

select count(*) as false_positive_corrective_maint
from public.procurements_compact
where document_category = 'amendment'
  and title ilike '%διορθωτικ%'
  and title ilike '%συντήρησ%'
  and title not ilike '%επιδιόρθωσ%';

select adam, publication_date, title
from public.procurements_compact
where document_category = 'amendment'
  and (title ilike '%επιδιόρθωσ%'
       or (title ilike '%διορθωτικ%' and title ilike '%συντήρησ%'))
order by publication_date desc
limit 25;
