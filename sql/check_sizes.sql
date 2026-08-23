select public.alert_email_candidates(
  'test-diagnostic@example.com',
  (select array_agg(cpv_code) from public.cpv_watchlist),
  null,
  365
);
