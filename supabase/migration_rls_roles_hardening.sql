-- Migración: aplica el sistema de roles (super_admin/operador/operador_carga)
-- a nivel de base de datos, no solo en el frontend. Antes, casi todas las
-- tablas tenían RLS "USING (true)" para cualquier autenticado — el middleware
-- bloqueaba la navegación a las páginas según rol, pero un usuario podía
-- llamar directo a Supabase desde la consola del navegador (mismo cliente +
-- anon key que ya usa la app) y leer/escribir cualquier tabla sin importar
-- su rol.
--
-- También cierra dos huecos encontrados en la auditoría:
--  - audit_logs no validaba que el usuario_id del log coincidiera con quien
--    lo insertaba (se podía insertar un log "a nombre de otro").
--  - inventario_items permitía DELETE físico aunque la app solo hace
--    soft-delete (activo=false); se restringe a super_admin.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── Helper: rol del usuario actual ───────────────────────────────────────
-- SECURITY DEFINER + STABLE: se evalúa una vez por consulta, no por fila, y
-- puede leer profiles aunque el caller no tenga policy de SELECT ahí (no la
-- necesita: solo lee su propia fila vía auth.uid()).
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ── clientes ──────────────────────────────────────────────────────────────
-- SELECT queda abierto: operador_carga necesita listar clientes para elegir
-- uno al crear un report (reports/nuevo). Solo se restringe quién puede
-- crear/editar clientes (esa página no está en sus rutas permitidas).
DROP POLICY IF EXISTS "Autenticados crean clientes"      ON clientes;
DROP POLICY IF EXISTS "Autenticados actualizan clientes" ON clientes;

CREATE POLICY "Operador+ crean clientes"
  ON clientes FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operador+ actualizan clientes"
  ON clientes FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));

-- ── tarifas_cliente / servicios_cliente / uf_valores ────────────────────
-- Datos de precios — operador_carga no tiene /servicios ni /hes en sus
-- rutas, así que no necesita ni leer estas tablas.
DROP POLICY IF EXISTS "Authenticated full access tarifas_cliente" ON tarifas_cliente;
CREATE POLICY "Operador+ acceso completo tarifas_cliente"
  ON tarifas_cliente FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

DROP POLICY IF EXISTS "Authenticated full access uf_valores" ON uf_valores;
CREATE POLICY "Operador+ acceso completo uf_valores"
  ON uf_valores FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

-- servicios_cliente puede no tener RLS habilitado aún si el proyecto se creó
-- antes de que existiera esta tabla en schema.sql — se habilita por las dudas.
ALTER TABLE servicios_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access servicios_cliente" ON servicios_cliente;
CREATE POLICY "Operador+ acceso completo servicios_cliente"
  ON servicios_cliente FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

-- ── inventario_items: quitar DELETE físico, la app solo hace soft-delete ──
DROP POLICY IF EXISTS "Autenticados eliminan inventario" ON inventario_items;
CREATE POLICY "Solo super_admin elimina inventario físicamente"
  ON inventario_items FOR DELETE TO authenticated
  USING (current_user_role() = 'super_admin');

-- ── audit_logs: no permitir insertar logs a nombre de otro usuario ───────
DROP POLICY IF EXISTS "Autenticados insertan audit_logs" ON audit_logs;
CREATE POLICY "Autenticados insertan sus propios audit_logs"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() OR usuario_id IS NULL);
