explain analyze select public.market_documents();
explain analyze select public.market_documents('2026', null, null, null, null, 'ΕΡΝΣΤ');
explain analyze select public.market_documents(null, null, null, null, array['094428065']);
explain analyze select public.market_trend('2026')
