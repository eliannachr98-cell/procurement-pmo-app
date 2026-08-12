alter role anon set statement_timeout = '15s';
select rolname, rolconfig from pg_roles where rolname = 'anon';
