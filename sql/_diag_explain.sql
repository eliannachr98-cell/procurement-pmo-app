select rolname, rolconfig from pg_roles where rolname in ('anon','authenticator','authenticated','postgres','service_role');
