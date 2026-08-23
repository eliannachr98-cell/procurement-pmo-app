select column_name, data_type
from information_schema.columns
where table_name = 'procurements_compact'
  and column_name ilike '%at%'
order by column_name;
