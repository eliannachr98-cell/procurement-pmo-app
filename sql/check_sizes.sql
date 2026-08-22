select column_name, data_type, character_maximum_length
from information_schema.columns
where table_schema = 'public' and table_name = 'procurements_compact' and column_name = 'title';

select adam, length(title) as title_len, title
from public.procurements_compact
where adam in ('26PROC019489969', '26PROC019294329');

select max(length(title)) as max_title_len, count(*) filter (where length(title) >= 100) as at_or_over_100
from public.procurements_compact;
