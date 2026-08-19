select rolname, rolconfig
from pg_roles
where rolname in ('authenticator','anon','authenticated','postgres','service_role');

show statement_timeout;
