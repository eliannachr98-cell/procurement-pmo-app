select similarity(
  'Διακήρυξη για την Μελέτη για τη στρατηγική διαχείρισης ανθρώπινων πόρων',
  'Προκήρυξη στην ΕΕ για την Μελέτη για τη στρατηγική διαχείρισης ανθρώπινων πόρων'
) as sim_score;

select public.alert_email_candidates(
  (select array_agg(cpv_code) from public.cpv_watchlist),
  (select array_agg(nuts_code) from public.alert_nuts_filter),
  14
) as candidates;
