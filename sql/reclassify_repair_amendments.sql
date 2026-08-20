-- One-off fix matching the compact_transform.py classifier correction:
-- "διόρθω" (used to detect amendment/correction notices) is also a
-- substring of "επιδιόρθωση" (repair) and appears alongside "συντήρηση" in
-- "διορθωτική συντήρηση" (corrective maintenance) - both describe a brand
-- new tender's subject, not a correction to a previous one. Confirmed via
-- title inspection: 48 notices already loaded as 'amendment' are actually
-- plain repair/maintenance declarations, wrongly excluded from tender
-- counts and budget totals as a result.
update public.procurements_compact
set document_category = 'declaration'
where document_category = 'amendment'
  and (title ilike '%επιδιόρθωσ%'
       or (title ilike '%διορθωτικ%' and title ilike '%συντήρησ%'));
