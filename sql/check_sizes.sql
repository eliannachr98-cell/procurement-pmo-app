insert into public.alert_submissions (adam) values ('24PROC015754368')
on conflict do nothing;

select public.alert_email_candidates(
  'test-diagnostic-award@example.com',
  array[]::text[],
  null,
  3650
);

delete from public.alert_submissions where adam = '24PROC015754368';
