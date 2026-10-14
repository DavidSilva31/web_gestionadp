-- Migración: oculta acciones admin.* de audit_logs a roles no super_admin.
-- La tabla se usa como feed de notificaciones compartido (movimientos,
-- reports, etc. deben seguir siendo visibles para todos los autenticados),
-- pero las acciones admin.crear_usuario / admin.eliminar_usuario /
-- admin.actualizar_usuario incluyen emails y roles de otros empleados —
-- un operador_carga no debería poder leerlas directo desde el cliente.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Autenticados leen audit_logs" ON audit_logs;

CREATE POLICY "Lectura de audit_logs según rol"
  ON audit_logs FOR SELECT TO authenticated
  USING (
    current_user_role() = 'super_admin'
    OR accion NOT LIKE 'admin.%'
  );
