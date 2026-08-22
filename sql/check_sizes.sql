select p.adam, p.title, p.authority_name, p.document_category,
       coalesce(p.budget_inc_vat, p.budget_ex_vat, p.budget_unknown_vat, 0) as budget
from public.alert_notifications_sent s
join public.procurements_compact p on p.adam = s.adam
where s.recipient_email = 'eliannachr.98@gmail.com'
order by p.authority_name, p.title;
