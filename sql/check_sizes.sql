select adam, publication_date, source_updated_at, synced_at, document_category
from public.procurements_compact
where adam in ('26PROC019625263','26PROC019561564','26PROC019518191');
