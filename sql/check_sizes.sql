set statement_timeout = '280000';
select (public.dashboard_breakdown(null, null, null, array['Προμήθειες','Υπηρεσίες'], null, null)->>'total') as total;
