insert into public.alert_notifications_sent (recipient_email, adam, notified_at)
values
  ('eliannachr.98@gmail.com', '26PROC019625263', '2026-08-23 07:10:00.015908+00'),
  ('eliannachr.98@gmail.com', '26PROC019561564', '2026-08-23 07:10:00.015908+00'),
  ('eliannachr.98@gmail.com', '26PROC019518191', '2026-08-23 07:10:00.015908+00')
on conflict (recipient_email, adam) do nothing;
