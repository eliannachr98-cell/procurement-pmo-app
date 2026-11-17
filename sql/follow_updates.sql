-- What happened since a given date to the things a profile follows, for the
-- "Ενημερώσεις" panel of the Προφίλ:
--   tenders      = for each followed tender (ADAM): a clarification, extension, amendment,
--                  decision or summary notice of the same authority and budget published
--                  since; an award or contract of it dated since; its cancellation;
--   cpvTenders   = new declarations (noticeType 3) in the followed CPV codes (and regions);
--   cpvEvents    = clarifications / extensions / amendments / cancellations since, of the
--                  recent tenders of those CPVs and regions;
--   contractors  = awards and contracts dated since won by a followed contractor
--                  (a key is a 9-digit VAT number or part of the name);
--   authorities  = declarations published since by a followed authority.
-- Contractor events read the ready-made tables of sql/market_facts.sql, so they are as fresh
-- as the last daily refresh. Related notices are found through the (authority, budget)
-- index of sql/related_notices.sql.
drop function if exists public.follow_updates(text[], text[], text[], date);
drop function if exists public.follow_updates(text[], text[], text[], date, text[], text[]);
drop function if exists public.tender_events(text[], date, text[], boolean);

-- Events of a set of tenders (by ADAM) since a date. p_doc_kinds: which related notices count;
-- p_outcomes: also awards and contracts.
create or replace function public.tender_events(
  p_adams text[], p_since date, p_doc_kinds text[], p_outcomes boolean
)
returns json
language plpgsql stable as $$
declare
  result json := '[]'::json;
begin
  if p_adams is null or cardinality(p_adams) = 0 then return result; end if;
  with t as (
    select p.adam, p.title, p.authority_name, p.publication_date, p.cancelled_at, p.opening_at, nullif(p.budget_ex_vat, 0) as budget_ex,
           coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) as budget
    from public.procurements_compact p
    where p.adam = any(p_adams)
  ),
  ev as (
    select distinct * from (
      select t.adam as tender, r.document_category::text as kind, r.publication_date::date as dt, r.adam as doc,
             r.title as doc_title, r.opening_at as opening, null::numeric as amount
      from t
      join public.procurements_compact r
        on r.authority_name = t.authority_name and r.adam <> t.adam
       and (coalesce(nullif(r.budget_inc_vat, 0), nullif(r.budget_ex_vat, 0), nullif(r.budget_unknown_vat, 0)) = t.budget or (t.budget_ex is not null and r.budget_ex_vat = t.budget_ex))
       and r.publication_date >= greatest(p_since, t.publication_date)
      where (t.budget > 0 or t.budget_ex is not null) and r.document_category = any(p_doc_kinds)
      union all
      select t.adam, 'award', a.award_date::date, a.adam, a.title, null::timestamptz,
             coalesce(nullif(a.amount_inc_vat, 0), nullif(a.amount_ex_vat, 0), nullif(a.amount_unknown_vat, 0))
      from t join public.awards_compact a on a.procurement_adam = t.adam
      where p_outcomes and a.award_date >= p_since
      union all
      select t.adam, 'contract', c.signed_date::date, c.adam, c.title, null::timestamptz,
             coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0))
      from t join public.contracts_compact c on c.procurement_adam = t.adam
      where p_outcomes and c.signed_date >= p_since
      union all
      select t.adam, 'contract', c.signed_date::date, c.adam, c.title, null::timestamptz,
             coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0))
      from t
      join public.awards_compact a2 on a2.procurement_adam = t.adam
      join public.contracts_compact c on c.award_adam = a2.adam
      where p_outcomes and c.signed_date >= p_since
      union all
      select t.adam, 'cancelled', t.cancelled_at::date, t.adam, t.title, null::timestamptz, null::numeric
      from t where t.cancelled_at >= p_since
    ) u
  )
  select coalesce(json_agg(x order by x.last_date desc), '[]'::json) into result from (
    select t.adam, t.title, t.authority_name as authority, t.opening_at as opening, max(ev.dt) as last_date,
           json_agg(json_build_object('kind', ev.kind, 'date', ev.dt, 'adam', ev.doc, 'title', ev.doc_title,
                                      'opening', ev.opening, 'amount', ev.amount) order by ev.dt desc) as events
    from t join ev on ev.tender = t.adam
    group by t.adam, t.title, t.authority_name, t.opening_at
    order by max(ev.dt) desc
    limit 100
  ) x;
  return result;
end;
$$;

create or replace function public.follow_updates(
  p_adams text[] default null,
  p_contractors text[] default null,
  p_authorities text[] default null,
  p_since date default (current_date - 30),
  p_cpv text[] default null,
  p_nuts text[] default null
)
returns json
language plpgsql stable as $$
declare
  tenders json := '[]'::json;
  cpv_tenders json := '[]'::json;
  cpv_events json := '[]'::json;
  contractors json := '[]'::json;
  authorities json := '[]'::json;
  market_adams text[];
  nuts_ok text := 'true';
begin
  tenders := public.tender_events(p_adams, p_since, array['amendment', 'extension', 'clarification', 'decision', 'summary'], true);

  if p_cpv is not null and cardinality(p_cpv) > 0 then
    if p_nuts is not null and cardinality(p_nuts) > 0 then
      nuts_ok := format('exists (select 1 from unnest(%L::text[]) np where p.nuts_code like np || ''%%'')', p_nuts);
    end if;
    -- new declarations in the followed CPVs (and regions)
    execute format($q$
      select coalesce(json_agg(json_build_object('adam', x.adam, 'title', x.title, 'authority', x.authority_name, 'date', x.publication_date,
                                                 'budget', x.budget, 'opening', x.opening_at, 'region', x.nuts_name) order by x.publication_date desc, x.adam), '[]'::json)
      from (
        select p.adam, p.title, p.authority_name, p.publication_date, p.opening_at, p.nuts_name,
               coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) as budget
        from public.procurements_compact p
        join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
        where p.document_category = 'declaration' and p.publication_date >= %1$L::date
          and exists (select 1 from public.record_cpvs_compact c where c.record_adam = p.adam and c.record_type = 'procurement' and c.cpv_code = any(%2$L::text[]))
          and %3$s
        order by p.publication_date desc, p.adam
        limit 100
      ) x
    $q$, p_since, p_cpv, nuts_ok) into cpv_tenders;

    -- the recent tenders of those CPVs (and regions): what changed in them since
    execute format($q$
      select array_agg(adam) from (
        select p.adam
        from public.procurements_compact p
        join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
        where p.document_category = 'declaration' and p.publication_date >= %1$L::date - 120
          and exists (select 1 from public.record_cpvs_compact c where c.record_adam = p.adam and c.record_type = 'procurement' and c.cpv_code = any(%2$L::text[]))
          and %3$s
        order by p.publication_date desc
        limit 1500
      ) y
    $q$, p_since, p_cpv, nuts_ok) into market_adams;
    cpv_events := public.tender_events(market_adams, p_since, array['amendment', 'extension', 'clarification'], false);
  end if;

  if p_contractors is not null and cardinality(p_contractors) > 0 then
    with keys as (select k.key, k.ord from unnest(p_contractors) with ordinality as k(key, ord)),
    rws0 as (
      select k.key, k.ord, f.contractor_name, f.kind, f.doc_date, f.doc_adam, f.n, f.amt, f.members
      from keys k join public.market_contractor_facts f on f.ckey = k.key
      where k.key ~ '^[0-9]{9}$'
      union all
      select k.key, k.ord, f.contractor_name, f.kind, f.doc_date, f.doc_adam, f.n, f.amt, f.members
      from keys k join public.market_contractor_facts f
        on position(translate(upper(k.key), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ') in translate(upper(f.contractor_name), 'ΆΈΉΊΌΎΏΪΫ', 'ΑΕΗΙΟΥΩΙΥ')) > 0
      where k.key !~ '^[0-9]{9}$'
    ),
    rws as (
      select r.key, r.ord, r.contractor_name, r.kind, coalesce(r.doc_date, t.publication_date) as dt,
             r.doc_adam, r.n, r.amt, r.members, t.authority_name,
             row_number() over (partition by r.key order by coalesce(r.doc_date, t.publication_date) desc nulls last) as rn
      from rws0 r
      join public.market_tender_facts t on t.adam = r.n
      where coalesce(r.doc_date, t.publication_date) >= p_since
    )
    select coalesce(json_agg(json_build_object(
             'key', key, 'name', name, 'total', total, 'items', items) order by ord), '[]'::json) into contractors
    from (
      select key, ord, max(contractor_name) as name, count(*) as total,
             json_agg(json_build_object('kind', kind, 'date', dt, 'adam', doc_adam, 'tender', n, 'authority', authority_name,
                                        'amount', amt, 'union', members > 1) order by dt desc) filter (where rn <= 40) as items
      from rws group by key, ord
    ) g;
  end if;

  if p_authorities is not null and cardinality(p_authorities) > 0 then
    select coalesce(json_agg(json_build_object('authority', x.authority_name, 'adam', x.adam, 'title', x.title,
                                               'date', x.publication_date, 'budget', x.budget) order by x.publication_date desc, x.adam), '[]'::json) into authorities
    from (
      select p.authority_name, p.adam, p.title, p.publication_date,
             coalesce(nullif(p.budget_inc_vat, 0), nullif(p.budget_ex_vat, 0), nullif(p.budget_unknown_vat, 0)) as budget
      from public.procurements_compact p
      join public.procurement_quality_flags f on f.adam = p.adam and f.notice_type_key = '3'
      where p.authority_name = any(p_authorities) and p.document_category = 'declaration' and p.publication_date >= p_since
      order by p.publication_date desc, p.adam
      limit 60
    ) x;
  end if;

  return json_build_object('since', p_since, 'tenders', tenders, 'cpvTenders', cpv_tenders, 'cpvEvents', cpv_events,
                           'contractors', contractors, 'authorities', authorities);
end;
$$;
