DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exclusive_app') THEN
    CREATE ROLE exclusive_app LOGIN PASSWORD 'cambia-esta-clave-larga' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE exclusive_db TO exclusive_app;
GRANT USAGE ON SCHEMA public TO exclusive_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO exclusive_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO exclusive_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, inventory_movements, security_events, error_logs FROM exclusive_app;

REVOKE CREATE ON SCHEMA public FROM exclusive_app;

SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos
FROM information_schema.role_table_grants
WHERE grantee = 'exclusive_app' AND table_name IN ('audit_logs', 'inventory_movements', 'security_events', 'error_logs')
GROUP BY table_name;
