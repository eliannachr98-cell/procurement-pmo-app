select 'multi-contractor records (award)' as what, count(*) as n from (select record_adam from public.record_contractors_compact where record_type = 'award' group by record_adam having count(*) > 1) t
union all
select 'multi-contractor records (contract)', count(*) from (select record_adam from public.record_contractors_compact where record_type = 'contract' group by record_adam having count(*) > 1) t
union all
select 'single-row records (award+contract)', count(*) from (select record_adam from public.record_contractors_compact group by record_adam having count(*) = 1) t
union all
select 'names with ΕΝΩΣΗ/ΚΟΙΝΟΠΡΑΞΙΑ/Κ/Ξ/ΣΥΜΠΡΑΞΗ', count(*) from public.record_contractors_compact where contractor_name ~* '(ΕΝΩΣΗ|ΚΟΙΝΟΠΡΑΞΙΑ|Κ/Ξ|ΣΥΜΠΡΑΞΗ|JOINT VENTURE)'
union all
select 'distinct such names', count(distinct contractor_name) from public.record_contractors_compact where contractor_name ~* '(ΕΝΩΣΗ|ΚΟΙΝΟΠΡΑΞΙΑ|Κ/Ξ|ΣΥΜΠΡΑΞΗ|JOINT VENTURE)'
union all
select 'union-named rows without VAT', count(*) from public.record_contractors_compact where contractor_name ~* '(ΕΝΩΣΗ|ΚΟΙΝΟΠΡΑΞΙΑ|Κ/Ξ|ΣΥΜΠΡΑΞΗ|JOINT VENTURE)' and (contractor_vat is null or trim(contractor_vat) = '');
