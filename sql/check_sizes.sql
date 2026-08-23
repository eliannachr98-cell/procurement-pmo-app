select count(*) as watchlist_count from public.cpv_watchlist;
select public.alert_email_candidates(
  'ilianna.charisi@pwc.com',
  (select array_agg(cpv_code) from public.cpv_watchlist),
  null,
  365
);
