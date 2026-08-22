select p.document_category, count(*)
from public.alert_notifications_sent s
join public.procurements_compact p on p.adam = s.adam
where s.recipient_email = 'eliannachr.98@gmail.com'
group by p.document_category
order by count(*) desc;
