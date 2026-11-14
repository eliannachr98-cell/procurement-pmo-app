select ckey, max(contractor_name) as name, count(*) filter (where kind = 'award') as awards, count(*) filter (where kind = 'contract') as contracts
from public.market_contractor_facts
where contractor_name ~* '(PRICEWATERHOUSE|PWC|ΕΡΝΣΤ ΚΑΙ ΓΙΑΝΓΚ|KPMG|DELOITTE|GRANT THORNTON|BRIGHT BUSINESS|PLANET ΑΕ|PLANET Α|REMACO|LEVER -|DIADIKASIA)'
group by ckey order by max(contractor_name);
