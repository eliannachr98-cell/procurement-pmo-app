delete from public.alert_notifications_sent
where recipient_email = 'eliannachr.98@gmail.com';

select public.alert_email_candidates(
  'eliannachr.98@gmail.com',
  (select array_agg(cpv_code) from public.cpv_watchlist),
  (select array_agg(nuts_code) from public.alert_nuts_filter)
) as candidates;
