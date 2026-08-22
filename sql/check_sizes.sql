select public.alert_email_candidates(
  (select array_agg(cpv_code) from public.cpv_watchlist),
  (select array_agg(nuts_code) from public.alert_nuts_filter),
  14
) as candidates;
