select clock_timestamp() as started;
select public.dashboard_breakdown(null, 'ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ', null, null, null, null)->'total' as total;
select clock_timestamp() as finished;
