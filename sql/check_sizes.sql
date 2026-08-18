select cache_key, refreshed_at, now() - refreshed_at as age
from public.dashboard_cache
order by cache_key;
