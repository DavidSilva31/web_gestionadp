-- Migración: corrige un hueco real encontrado en auditoría — servicios_cliente
-- tenía policies viejas y abiertas ("Autenticados leen/crean/actualizan/
-- eliminan servicios_cliente", de supabase_security_fixes.sql) que nunca se
-- borraron porque migration_rls_roles_hardening.sql intentó borrar un nombre
-- de policy que nunca existió ("Authenticated full access servicios_cliente").
-- Postgres combina policies permisivas con OR: la vieja abierta ganaba sobre
-- la nueva restringida a operador+super_admin, dejando la tabla de precios
-- escribible por cualquier autenticado (incluido operador_carga).
-- Confirmado en vivo con cuenta operador_carga de prueba antes de aplicar.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Autenticados leen servicios_cliente"       ON servicios_cliente;
DROP POLICY IF EXISTS "Autenticados crean servicios_cliente"      ON servicios_cliente;
DROP POLICY IF EXISTS "Autenticados actualizan servicios_cliente" ON servicios_cliente;
DROP POLICY IF EXISTS "Autenticados eliminan servicios_cliente"   ON servicios_cliente;

-- La policy "Operador+ acceso completo servicios_cliente" (FOR ALL) ya existe
-- y queda como única policy de la tabla — no se toca.
