set statement_timeout = '60000';
select clock_timestamp() as t_start;
select public.dashboard_breakdown(p_contract_type := array['Προμήθειες']) is not null as ok;
select clock_timestamp() as t_end;
