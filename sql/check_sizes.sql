set statement_timeout = '90000';
select public.dashboard_breakdown(p_contract_type := array['Έργα']) is not null as ok;
