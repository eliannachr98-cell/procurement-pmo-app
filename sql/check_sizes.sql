select adam, notified_at
from public.alert_notifications_sent
where recipient_email = 'eliannachr.98@gmail.com'
order by notified_at;
