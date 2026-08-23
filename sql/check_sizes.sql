select recipient_email, count(*) as sent_rows, min(notified_at) as first_sent, max(notified_at) as last_sent
from public.alert_notifications_sent
group by recipient_email;
