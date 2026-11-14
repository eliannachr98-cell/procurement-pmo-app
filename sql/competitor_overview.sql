-- The Ανταγωνισμός block: figures ONLY for the contractors a profile follows
-- (a key is a 9-digit VAT number, or a part of the name), over the whole market
-- (optionally one year). Reads the ready-made tables of sql/market_facts.sql.
--
-- Per contractor: awards, contracts, value (a consortium's amount is split among
-- its members), average / median discount and the share of its tenders with a
-- discount above 0, the average budget of the tenders it won, the date of its last
-- award or contract, the share of its work done in a consortium, its awards and
-- contracts per month (last 24 months) and its main clients (authorities).
-- Plus the authorities where two or more of the followed contractors won.
--
-- Only winners are known - there is no data on who bid and lost.
drop function if exists public.competitor_overview(text[], text);

create or replace function public.competitor_overview(
  p_keys text[],
  p_year text default null
)
returns json
language plpgsql stable as $$
declare
  result json;
begin
  with keys as (
    select k.key, k.ord from unnest(coalesce(p_keys, array[]::text[])) with ordinality as k(key, ord)
  ),
  rws as (
    select k.key, k.ord, f.ckey, f.contractor_name, f.n, f.amt, f.kind, f.members,
           coalesce(f.amt_share, f.amt) as share, f.doc_date, f.doc_adam,
           t.authority_name, t.publication_date, t.budget, t.discount
    from keys k
    join public.market_contractor_facts f
      on (k.key ~ '^[0-9]{9}$' and f.ckey = k.key)
      or (k.key !~ '^[0-9]{9}$' and position(translate(upper(k.key), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') in translate(upper(f.contractor_name), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ')) > 0)
    join public.market_tender_facts t on t.adam = f.n
    where p_year is null
       or (t.publication_date >= (p_year || '-01-01')::date and t.publication_date <= (p_year || '-12-31')::date)
  ),
  agg as (
    select key, ord, max(contractor_name) as name,
           count(*) filter (where kind = 'award') as awards,
           count(*) filter (where kind = 'contract') as contracts,
           coalesce(sum(share), 0) as value,
           100.0 * count(*) filter (where members > 1) / nullif(count(*), 0) as union_share,
           max(coalesce(doc_date, publication_date)) as last_date
    from rws group by key, ord
  ),
  won as (select distinct key, n, budget, discount from rws),
  disc as (
    select key, count(discount) as cnt,
           avg(discount) * 100 as average,
           percentile_cont(0.5) within group (order by discount) * 100 as median,
           100.0 * count(*) filter (where discount > 0.0005) / nullif(count(discount), 0) as positive_share,
           avg(budget) filter (where budget > 0) as avg_budget
    from won group by key
  ),
  monthly as (
    select key, to_char(date_trunc('month', coalesce(doc_date, publication_date)), 'YYYY-MM') as m, count(*) as c
    from rws
    where coalesce(doc_date, publication_date) >= (current_date - interval '24 months')
    group by 1, 2
  ),
  clients as (
    select key, authority_name, count(*) as c,
           count(*) filter (where kind = 'award') as a, count(*) filter (where kind = 'contract') as k,
           sum(share) as v,
           row_number() over (partition by key order by count(*) desc, sum(share) desc) as rn
    from rws group by key, authority_name
  ),
  client_total as (select key, sum(c) as total from clients group by key),
  common as (
    select authority_name, count(*) as competitors, sum(c) as payments,
           array_agg(key) as keys,
           json_agg(json_build_object('key', key, 'count', c) order by c desc) as by
    from (select authority_name, key, count(*) as c from rws group by authority_name, key) x
    group by authority_name having count(*) >= 2
  ),
  pooled as (select distinct n, discount from won where discount is not null)
  select json_build_object(
    'competitors', coalesce((
      select json_agg(json_build_object(
        'key', k.key,
        'name', coalesce(a.name, k.key),
        'awards', coalesce(a.awards, 0),
        'contracts', coalesce(a.contracts, 0),
        'value', coalesce(a.value, 0),
        'lastDate', a.last_date,
        'unionShare', a.union_share,
        'avgBudget', d.avg_budget,
        'discount', json_build_object('count', coalesce(d.cnt, 0), 'average', d.average, 'median', d.median, 'positiveShare', d.positive_share),
        'monthly', coalesce((select json_agg(json_build_object('month', m.m, 'count', m.c) order by m.m) from monthly m where m.key = k.key), '[]'::json),
        'clients', coalesce((select json_agg(json_build_object('authority', c.authority_name, 'count', c.c, 'awards', c.a, 'contracts', c.k, 'value', c.v, 'share', 100.0 * c.c / nullif(ct.total, 0)) order by c.rn)
                              from clients c join client_total ct on ct.key = c.key where c.key = k.key), '[]'::json),
        'items', coalesce((select json_agg(json_build_object('adam', r.doc_adam, 'tender', r.n, 'kind', r.kind, 'date', coalesce(r.doc_date, r.publication_date), 'authority', r.authority_name, 'amount', r.amt, 'union', r.members > 1) order by coalesce(r.doc_date, r.publication_date) desc nulls last)
                            from (select * from rws where rws.key = k.key order by coalesce(rws.doc_date, rws.publication_date) desc nulls last limit 1500) r), '[]'::json)
      ) order by k.ord)
      from keys k left join agg a on a.key = k.key left join disc d on d.key = k.key
    ), '[]'::json),
    'common', coalesce((
      select json_agg(json_build_object('authority', authority_name, 'competitors', competitors, 'payments', payments, 'keys', keys, 'by', by) order by competitors desc, payments desc)
      from (select * from common order by competitors desc, payments desc limit 150) x
    ), '[]'::json),
    'summary', json_build_object('discount', (select json_build_object('count', count(*), 'median', percentile_cont(0.5) within group (order by discount) * 100, 'average', avg(discount) * 100) from pooled))
  ) into result;
  return result;
end;
$$;
