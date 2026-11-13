select 'contractor rows (n, amt, contractor)' as what, count(*) as n from public.market_contractor_facts
union all
select 'distinct (n, amt) payments', count(*) from (select 1 from public.market_contractor_facts group by n, amt) t
union all
select '(n, amt) with more than one contractor', count(*) from (select 1 from public.market_contractor_facts group by n, amt having count(*) > 1) t
union all
select 'rows with ΕΝΩΣΗ/ΚΟΙΝΟΠΡΑΞΙΑ/Κ/Ξ/ΣΥΜΠΡΑΞΗ in name', count(*) from public.market_contractor_facts where contractor_name ~* '(ΕΝΩΣΗ|ΚΟΙΝΟΠΡΑΞΙΑ|Κ/Ξ|ΣΥΜΠΡΑΞΗ|JOINT VENTURE)'
union all
select 'such rows whose key is not a 9-digit VAT', count(*) from public.market_contractor_facts where contractor_name ~* '(ΕΝΩΣΗ|ΚΟΙΝΟΠΡΑΞΙΑ|Κ/Ξ|ΣΥΜΠΡΑΞΗ|JOINT VENTURE)' and ckey !~ '^[0-9]{9}$'
union all
select 'sum of amounts counted per contractor', round(sum(amt)) from public.market_contractor_facts
union all
select 'sum of amounts counted once per payment', round(sum(a)) from (select max(amt) as a from public.market_contractor_facts group by n, amt) t;
