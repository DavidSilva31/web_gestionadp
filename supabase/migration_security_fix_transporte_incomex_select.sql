-- Fix ALTO (auditoría de seguridad): transporte_incomex permitía SELECT a
-- cualquier autenticado ("Autenticados ven transporte incomex", USING(true),
-- migration_transporte_incomex.sql:38-39), incluido operador_carga — pero la
-- tabla guarda costo_uf/tarifa_tte_clp/factura_adp_incomex_uf, el margen
-- interno de ADP que el propio comentario del archivo original dice que
-- "nunca va al HES [del cliente]". El mismo tipo de dato en tarifas_cliente
-- y servicios_cliente ya está restringido a operador+super_admin — acá
-- quedó afuera por inconsistencia, no a propósito. operador_carga no tiene
-- /transporte-incomex en sus rutas permitidas (ver ROLE_ROUTES en
-- src/types/auth.ts), así que esto no rompe ningún flujo legítimo.

DROP POLICY IF EXISTS "Autenticados ven transporte incomex" ON transporte_incomex;
CREATE POLICY "Operador y superadmin ven transporte incomex" ON transporte_incomex
  FOR SELECT TO authenticated USING (current_user_role() IN ('operador', 'super_admin'));
