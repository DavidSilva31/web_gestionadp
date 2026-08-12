-- Migración: movimientos quedó con policies abiertas a cualquier autenticado
-- para INSERT/UPDATE ("Autenticados crean/actualizan movimientos", de
-- schema.sql) — el mismo hueco que ya se cerró en clientes/tarifas_cliente/
-- servicios_cliente/inventario_items (migration_rls_roles_hardening.sql),
-- nunca se aplicó acá. operador_carga (sin la ruta /movimientos en la UI)
-- podía insertar/actualizar movimientos directo por la API REST de Supabase,
-- lo que dispara sync_inventario_from_movimiento (altera stock_actual real)
-- y alimenta los cálculos de HES para clientes/tarifas fuera de su alcance.
--
-- SELECT queda abierto a todo autenticado (solo lectura, sin riesgo).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Autenticados crean movimientos"      ON movimientos;
DROP POLICY IF EXISTS "Autenticados actualizan movimientos" ON movimientos;

CREATE POLICY "Operador+ crean movimientos"
  ON movimientos FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operador+ actualizan movimientos"
  ON movimientos FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));
