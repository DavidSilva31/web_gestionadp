-- Detalle (Kardex de /inventario) necesita poder eliminar una fila de
-- movimiento agregada por error, además de editarla — pero movimientos
-- nunca tuvo política de DELETE (migration_rls_reports_movimientos_hardening.sql
-- solo agregó INSERT/UPDATE para Operador+), así que hoy un DELETE desde la
-- app se queda callado sin borrar nada (RLS deniega por defecto sin política).
-- Mismo criterio de rol que INSERT/UPDATE en esa migración.

DROP POLICY IF EXISTS "Operador+ eliminan movimientos" ON movimientos;
CREATE POLICY "Operador+ eliminan movimientos"
  ON movimientos FOR DELETE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));
