select count(*) as remaining_repair_amendments
from public.procurements_compact
where document_category = 'amendment'
  and (title ilike '%επιδιόρθωσ%'
       or (title ilike '%διορθωτικ%' and title ilike '%συντήρησ%'));
