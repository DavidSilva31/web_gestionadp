-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIXES — ADP Gestión · Supabase
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. FUNCTION SEARCH PATH MUTABLE ─────────────────────────────────
-- Sin search_path fijo, un atacante podría crear una función o tabla
-- en otro schema y redirigir la ejecución. Se fija a 'public'.

ALTER FUNCTION public.update_updated_at()              SET search_path = public;
ALTER FUNCTION public.sync_inventario_stock()          SET search_path = public;
ALTER FUNCTION public.sync_inventario_from_movimiento() SET search_path = public;
ALTER FUNCTION public.create_movimiento_from_report()  SET search_path = public;
ALTER FUNCTION public.update_stock(uuid, integer)      SET search_path = public;


-- ── 2. HANDLE_NEW_USER — REVOKE RPC ACCESS ───────────────────────────
-- Esta función es un trigger (auth.users → profiles), no debería ser
-- invocable directamente vía /rest/v1/rpc por ningún rol.
-- Se revoca desde PUBLIC (que cubre anon + authenticated + todos los roles).

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;


-- ── 3. SERVICIOS_CLIENTE — REEMPLAZAR allow_all SIN ROL ──────────────
-- La política "allow_all" aplica a todos los roles (incluido anon).
-- Se reemplaza por políticas explícitas solo para authenticated.

DROP POLICY IF EXISTS allow_all                              ON public.servicios_cliente;
DROP POLICY IF EXISTS "Autenticados leen servicios_cliente"       ON public.servicios_cliente;
DROP POLICY IF EXISTS "Autenticados crean servicios_cliente"      ON public.servicios_cliente;
DROP POLICY IF EXISTS "Autenticados actualizan servicios_cliente" ON public.servicios_cliente;
DROP POLICY IF EXISTS "Autenticados eliminan servicios_cliente"   ON public.servicios_cliente;

CREATE POLICY "Autenticados leen servicios_cliente"
  ON public.servicios_cliente FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Autenticados crean servicios_cliente"
  ON public.servicios_cliente FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan servicios_cliente"
  ON public.servicios_cliente FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados eliminan servicios_cliente"
  ON public.servicios_cliente FOR DELETE
  TO authenticated USING (true);


-- ── NOTAS SOBRE LOS WARNINGS RESTANTES ───────────────────────────────
--
-- rls_policy_always_true en clientes, inventario_items, movimientos,
-- reports, audit_logs y tarifas_cliente:
--   → Son WARN informativos, NO son vulnerabilidades en este sistema.
--   → Todas las políticas ya exigen rol "authenticated" (nadie anónimo
--     puede escribir). El control de acceso por rol (super_admin /
--     operador / operador_carga) se aplica a nivel de proxy.ts y
--     rutas API, no a nivel de fila, lo cual es correcto para un
--     sistema interno de usuarios confiables administrados manualmente.
--   → Si en el futuro se necesita restricción por fila (ej: cada
--     usuario solo ve sus propios registros), agregar condiciones
--     como: USING (auth.uid() = created_by).
--
-- auth_leaked_password_protection:
--   → Activar en: Supabase Dashboard → Authentication → Security →
--     "Enable leaked password protection" (toggle).
--   → No requiere SQL.
-- ═══════════════════════════════════════════════════════════════════
