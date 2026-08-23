select column_name, data_type
from information_schema.columns
where table_name = 'record_contractors_compact'
order by column_name;
