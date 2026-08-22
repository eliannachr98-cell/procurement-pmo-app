select s.adam, s.notified_at, p.title, p.authority_name, p.document_category, p.publication_date
from public.alert_notifications_sent s
join public.procurements_compact p on p.adam = s.adam
order by s.notified_at, p.adam;
