-- What happened since a given date to the things a profile follows, for the
-- "Ενημερώσεις" panel of the Προφίλ:
--   tenders      = for each followed tender (ADAM): a clarification, extension,
--                  amendment, decision or summary notice of the same authority and
--                  budget published since; an award or contract of it dated since;
--                  its cancellation;
--   contractors  = awards and contracts dated since won by a followed contractor
--                  (a key is a 9-digit VAT number or part of the name);
--   authorities  = declarations (noticeType 3) published since by a followed authority.
-- Contractor events read the ready-made tables of sql/market_facts.sql, so they are
-- as fresh as the last daily refresh.
drop function if exists public.follow_updates(text[], text[], text[], date);

create or replace function public.follow_updates(
  p_adams text[] default null,
  p_contractors text[] default null,
  p_authorities text[] default null,
  p_since date default (current_date - 30)
)
returns json
language plpgsql stable as $$
declare
  tenders json := '[]'::json;
  contractors json := '[]'::json;
  authorities json := '[]'::json;
begin
  if p_adams is not null and cardinality(p_adams) > 0 then
    with t as (
      select p.adam, p.title, p.authority_name, p.publication_date, p.cancelled_at,
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
         and r.document_category in ('amendment', 'extension', 'clarification', 'decision', 'summary')
         and r.publication_date >= greatest(p_since, t.publication_date)
         and t.budget > 0
         and (r.budget_inc_vat = t.budget or r.budget_ex_vat = t.budget or r.budget_unknown_vat = t.budget)
        union all
        select t.adam, 'award', a.award_date::date, a.adam, a.title, null::timestamptz,
               coalesce(nullif(a.amount_inc_vat, 0), nullif(a.amount_ex_vat, 0), nullif(a.amount_unknown_vat, 0))
        from t join public.awards_compact a on a.procurement_adam = t.adam
        where a.award_date >= p_since
        union all
        select t.adam, 'contract', c.signed_date::date, c.adam, c.title, null::timestamptz,
               coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0))
        from t join public.contracts_compact c on c.procurement_adam = t.adam
        where c.signed_date >= p_since
        union all
        select t.adam, 'contract', c.signed_date::date, c.adam, c.title, null::timestamptz,
               coalesce(nullif(c.amount_inc_vat, 0), nullif(c.amount_ex_vat, 0), nullif(c.amount_unknown_vat, 0))
        from t
        join public.awards_compact a2 on a2.procurement_adam = t.adam
        join public.contracts_compact c on c.award_adam = a2.adam
        where c.signed_date >= p_since
        union all
        select t.adam, 'cancelled', t.cancelled_at::date, t.adam, t.title, null::timestamptz, null::numeric
        from t where t.cancelled_at >= p_since
      ) u
    )
    select coalesce(json_agg(x order by x.last_date desc), '[]'::json) into tenders from (
      select t.adam, t.title, t.authority_name as authority, max(ev.dt) as last_date,
             json_agg(json_build_object('kind', ev.kind, 'date', ev.dt, 'adam', ev.doc, 'title', ev.doc_title,
                                        'opening', ev.opening, 'amount', ev.amount) order by ev.dt desc) as events
      from t join ev on ev.tender = t.adam
      group by t.adam, t.title, t.authority_name
    ) x;
  end if;

  if p_contractors is not null and cardinality(p_contractors) > 0 then
    with keys as (select k.key, k.ord from unnest(p_contractors) with ordinality as k(key, ord)),
    rws0 as (
      -- 9-digit VAT keys: a direct (indexed) match on the contractor key
      select k.key, k.ord, f.contractor_name, f.kind, f.doc_date, f.doc_adam, f.n, f.amt, f.members
      from keys k join public.market_contractor_facts f on f.ckey = k.key
      where k.key ~ '^[0-9]{9}$'
      union all
      -- name keys: a part of the name (accents ignored)
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

  return json_build_object('since', p_since, 'tenders', tenders, 'contractors', contractors, 'authorities', authorities);
end;
$$;
