explain analyze select public.market_trend();
explain analyze select public.market_ranking('contractor');
explain analyze select public.market_ranking('authority');
explain analyze select public.market_documents();
explain analyze select public.market_ranking('contractor', '2026', null, null, null, null, 'ΕΡΝΣΤ');
select left(public.market_ranking('contractor', '2026', null, null, null, null, null, 'value', 'desc', 2)::text, 900) as sample_contractor;
select left(public.market_ranking('authority', null, null, null, null, null, null, 'value', 'desc', 2)::text, 900) as sample_authority;
select left(public.market_documents(null, null, null, null, array['094428065'], null, 'date', 'desc', 2)::text, 900) as sample_docs
