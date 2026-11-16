-- The "Αγορά & Ανταγωνισμός" tab: three views over the ready-made tables of
-- sql/market_facts.sql, all with the same filters (year, authority, contract type,
-- CPV codes, contractors):
--   market_trend      awards / contracts / value per month
--   market_ranking    one row per contractor or per authority, sortable and searchable
--   market_documents  one row per award or contract (ADAM, date, authority, contractor, amount, discount)
-- A contractor filter entry is a 9-digit VAT number or a part of the name.
drop function if exists public.market_where(text, text, text[], text[], text[]);
drop function if exists public.market_cwhere(text[]);
drop function if exists public.market_trend(text, text, text[], text[], text[]);
drop function if exists public.market_ranking(text, text, text, text[], text[], text[], text, text, text, integer, integer);
drop function if exists public.market_documents(text, text, text[], text[], text[], text, text, text, integer, integer);

-- the condition on market_tender_facts (alias p)
create or replace function public.market_where(
  p_year text, p_authority text, p_contract_type text[], p_cpv text[], p_contractors text[]
) returns text language plpgsql stable as $$
declare
  conds text[] := array['true'];
  scope_sql text;
begin
  if p_year is not null and p_year <> '' then
    conds := conds || format('p.publication_date >= %L::date and p.publication_date <= %L::date', p_year || '-01-01', p_year || '-12-31');
  end if;
  if p_authority is not null and p_authority <> '' then
    conds := conds || format('p.authority_name ilike %L', '%' || p_authority || '%');
  end if;
  if p_contract_type is not null and cardinality(p_contract_type) > 0 then
    conds := conds || format('p.contract_type = any(%L::text[])', p_contract_type);
  end if;
  if p_cpv is not null and cardinality(p_cpv) > 0 then
    scope_sql := public.scope_condition(p_cpv, null, null, null);
    if scope_sql is not null then conds := conds || scope_sql; end if;
  end if;
  if p_contractors is not null and cardinality(p_contractors) > 0 then
    conds := conds || format('p.adam in (select f.n from public.market_contractor_facts f where %s)', public.market_cwhere(p_contractors));
  end if;
  return array_to_string(conds, ' and ');
end;
$$;

-- the condition on market_contractor_facts (alias f)
create or replace function public.market_cwhere(p_contractors text[]) returns text language plpgsql stable as $$
declare
  vats text[];
  names text[];
  parts text[] := array[]::text[];
begin
  if p_contractors is null or cardinality(p_contractors) = 0 then return 'true'; end if;
  select coalesce(array_agg(x) filter (where x ~ '^[0-9]{9}$'), array[]::text[]),
         coalesce(array_agg('%' || x || '%') filter (where x !~ '^[0-9]{9}$'), array[]::text[])
    into vats, names from unnest(p_contractors) x;
  if cardinality(vats) > 0 then parts := parts || format('f.ckey = any(%L::text[])', vats); end if;
  if cardinality(names) > 0 then parts := parts || format('f.contractor_name ilike any(%L::text[])', names); end if;
  return '(' || array_to_string(parts, ' or ') || ')';
end;
$$;

create or replace function public.market_trend(
  p_year text default null, p_authority text default null, p_contract_type text[] default null,
  p_cpv text[] default null, p_contractors text[] default null
) returns json language plpgsql stable as $$
declare
  result json;
begin
  execute format($q$
    with matched as (select p.adam, p.publication_date from public.market_tender_facts p where %s),
    pay as (
      select f.n, f.amt, f.kind, min(coalesce(f.doc_date, m.publication_date)) as dt
      from public.market_contractor_facts f join matched m on m.adam = f.n
      where %s group by f.n, f.amt, f.kind
    )
    select coalesce(json_agg(json_build_object('month', mo, 'awards', a, 'contracts', c, 'value', v) order by mo), '[]'::json) from (
      select to_char(date_trunc('month', dt), 'YYYY-MM') as mo,
             count(*) filter (where kind = 'award') as a, count(*) filter (where kind = 'contract') as c, sum(amt) as v
      from pay where dt is not null group by 1
    ) t
  $q$, public.market_where(p_year, p_authority, p_contract_type, p_cpv, p_contractors), public.market_cwhere(p_contractors)) into result;
  return result;
end;
$$;

create or replace function public.market_ranking(
  p_by text default 'contractor', p_year text default null, p_authority text default null,
  p_contract_type text[] default null, p_cpv text[] default null, p_contractors text[] default null,
  p_search text default null, p_sort text default 'value', p_dir text default 'desc',
  p_limit integer default 50, p_offset integer default 0
) returns json language plpgsql stable as $$
declare
  where_sql text := public.market_where(p_year, p_authority, p_contract_type, p_cpv, p_contractors);
  c_sql text := public.market_cwhere(p_contractors);
  sort_col text;
  dir text := case when lower(p_dir) = 'asc' then 'asc' else 'desc' end;
  search_sql text := 'true';
  result json;
begin
  if p_by = 'authority' then
    sort_col := case p_sort when 'name' then 'name' when 'tenders' then 'tenders' when 'awards' then 'awards' when 'contracts' then 'contracts'
      when 'total' then '(awards + contracts)' when 'conversion' then 'conversion' when 'median' then 'median' when 'topshare' then 'topshare' else 'value' end;
    if p_search is not null and p_search <> '' then search_sql := format('name ilike %L', '%' || p_search || '%'); end if;
    execute format($q$
      with matched as (select p.* from public.market_tender_facts p where %1$s),
      agg as (
        select m.authority_name as name, count(*) as tenders, count(*) filter (where m.awards_n + m.contracts_n > 0) as with_award,
               sum(m.awards_n) as awards, sum(m.contracts_n) as contracts, coalesce(sum(m.awards_value + m.contracts_value), 0) as value,
               percentile_cont(0.5) within group (order by m.discount) filter (where m.discount is not null) * 100 as median,
               count(m.discount) as dn
        from matched m group by m.authority_name
      ),
      by_c as (
        select m.authority_name, f.ckey, max(f.contractor_name) as cname, sum(coalesce(f.amt_share, f.amt)) as v
        from matched m join public.market_contractor_facts f on f.n = m.adam where %2$s group by m.authority_name, f.ckey
      ),
      top as (select distinct on (authority_name) authority_name, cname, v from by_c order by authority_name, v desc),
      rows as (
        select a.name, a.tenders, a.with_award, a.awards, a.contracts, a.value, a.median, a.dn,
               100.0 * a.with_award / nullif(a.tenders, 0) as conversion,
               t.cname as top_name, 100.0 * t.v / nullif(a.value, 0) as topshare
        from agg a left join top t on t.authority_name = a.name
      ),
      filtered as (select * from rows where %3$s)
      select json_build_object(
        'total', (select count(*) from filtered),
        'totals', (select json_build_object('tenders', coalesce(sum(tenders), 0), 'awards', coalesce(sum(awards), 0), 'contracts', coalesce(sum(contracts), 0), 'value', coalesce(sum(value), 0)) from filtered),
        'rows', coalesce((select json_agg(r) from (select * from filtered order by %4$s %5$s nulls last, name limit %6$s offset %7$s) r), '[]'::json))
    $q$, where_sql, c_sql, search_sql, sort_col, dir, greatest(p_limit, 1), greatest(p_offset, 0)) into result;
  else
    sort_col := case p_sort when 'name' then 'name' when 'awards' then 'awards' when 'contracts' then 'contracts' when 'total' then '(awards + contracts)'
      when 'share' then 'value' when 'median' then 'median' when 'avgbudget' then 'avgbudget' when 'last' then 'last_date'
      when 'tenders' then 'tenders' when 'authorities' then 'authorities' else 'value' end;
    if p_search is not null and p_search <> '' then search_sql := format('name ilike %L', '%' || p_search || '%'); end if;
    execute format($q$
      with matched as (select p.* from public.market_tender_facts p where %1$s),
      rws as (
        select f.ckey, f.contractor_name, f.kind, f.n, coalesce(f.amt_share, f.amt) as share, coalesce(f.doc_date, m.publication_date) as dt,
               m.authority_name, m.budget, m.discount
        from public.market_contractor_facts f join matched m on m.adam = f.n where %2$s
      ),
      agg as (
        select ckey, max(contractor_name) as name, count(*) filter (where kind = 'award') as awards, count(*) filter (where kind = 'contract') as contracts,
               coalesce(sum(share), 0) as value, count(distinct n) as tenders, count(distinct authority_name) as authorities, max(dt) as last_date
        from rws group by ckey
      ),
      disc as (
        select ckey, percentile_cont(0.5) within group (order by discount) filter (where discount is not null) * 100 as median,
               count(discount) as dn, avg(budget) filter (where budget > 0) as avgbudget
        from (select distinct ckey, n, discount, budget from rws) x group by ckey
      ),
      rows as (
        select a.ckey as key, a.name, a.awards, a.contracts, a.value, a.tenders, a.authorities, a.last_date, d.median, d.dn, d.avgbudget,
               100.0 * a.value / nullif(sum(a.value) over (), 0) as share
        from agg a left join disc d on d.ckey = a.ckey
      ),
      filtered as (select * from rows where %3$s)
      select json_build_object(
        'total', (select count(*) from filtered),
        'totals', (select json_build_object('awards', coalesce(sum(awards), 0), 'contracts', coalesce(sum(contracts), 0), 'value', coalesce(sum(value), 0)) from filtered),
        'rows', coalesce((select json_agg(r) from (select * from filtered order by %4$s %5$s nulls last, name limit %6$s offset %7$s) r), '[]'::json))
    $q$, where_sql, c_sql, search_sql, sort_col, dir, greatest(p_limit, 1), greatest(p_offset, 0)) into result;
  end if;
  return result;
end;
$$;

create or replace function public.market_documents(
  p_year text default null, p_authority text default null, p_contract_type text[] default null,
  p_cpv text[] default null, p_contractors text[] default null,
  p_search text default null, p_sort text default 'date', p_dir text default 'desc',
  p_limit integer default 50, p_offset integer default 0
) returns json language plpgsql stable as $$
declare
  where_sql text := public.market_where(p_year, p_authority, p_contract_type, p_cpv, p_contractors);
  c_sql text := public.market_cwhere(p_contractors);
  sort_col text := case p_sort when 'amount' then 'amount' when 'authority' then 'authority' when 'contractor' then 'contractor' when 'discount' then 'discount' when 'kind' then 'kind' else 'dt' end;
  dir text := case when lower(p_dir) = 'asc' then 'asc' else 'desc' end;
  search_sql text := 'true';
  title_join text := '';
  title_col text := 'null::text';
  result json;
begin
  -- titles are only looked up for every row when the search has to look inside them;
  -- otherwise just for the rows of the page shown
  if p_search is not null and p_search <> '' then
    title_join := 'left join public.procurements_compact pr on pr.adam = pay.tender';
    title_col := 'pr.title';
    search_sql := format('(authority ilike %1$L or contractor ilike %1$L or adam ilike %1$L or tender ilike %1$L or title ilike %1$L)', '%' || p_search || '%');
  end if;
  execute format($q$
    with matched as (select p.adam, p.authority_name, p.discount, p.budget, p.publication_date from public.market_tender_facts p where %1$s),
    pay as materialized (
      select min(f.doc_adam) as adam, f.n as tender, f.kind, f.amt as amount,
             min(coalesce(f.doc_date, m.publication_date)) as dt, string_agg(distinct f.contractor_name, ' + ') as contractor,
             max(f.members) > 1 as is_union, m.authority_name as authority, m.discount, m.budget
      from public.market_contractor_facts f join matched m on m.adam = f.n where %2$s
      group by f.n, f.kind, f.amt, m.authority_name, m.discount, m.budget
    ),
    filtered as materialized (select pay.*, %8$s as title from pay %9$s where %3$s),
    page as (select * from filtered order by %4$s %5$s nulls last, adam limit %6$s offset %7$s)
    select json_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((select json_agg(r order by r.rn) from (
        select row_number() over (order by %4$s %5$s nulls last, page.adam) as rn,
               page.adam, page.tender, page.kind, page.amount, page.dt as date, page.contractor, page.is_union as "union", page.authority,
               page.discount * 100 as discount, page.budget,
               left(coalesce(page.title, (select pc.title from public.procurements_compact pc where pc.adam = page.tender)), 160) as title
        from page) r), '[]'::json))
  $q$, where_sql, c_sql, search_sql, sort_col, dir, greatest(p_limit, 1), greatest(p_offset, 0), title_col, title_join) into result;
  return result;
end;
$$;
