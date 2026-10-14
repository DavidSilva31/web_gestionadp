-- Auditoría de seguridad: inventario_items INSERT/UPDATE quedó en
-- USING(true)/WITH CHECK(true) desde schema.sql — a diferencia de
-- movimientos/clientes/tarifas_cliente/servicios_cliente, que ya se
-- restringieron a Operador+ (migration_rls_roles_hardening.sql,
-- migration_rls_reports_movimientos_hardening.sql). Cualquier usuario
-- autenticado (incluido operador_carga) podía pegarle directo a la REST
-- API y pisar stock_actual/stock_unidades/cliente_id de cualquier ítem,
-- saltándose el trigger de movimientos y el rastro de auditoría por
-- completo.
--
-- OJO — esto NO se resuelve copiando el patrón "Operador+ only" de
-- movimientos tal cual: sync_inventario_stock() (trigger sobre reports) y
-- sync_inventario_from_movimiento() (trigger sobre movimientos) NO son
-- SECURITY DEFINER — corren con los permisos de quien despacha el report,
-- que en la práctica suele ser operador_carga. Restringir el UPDATE de
-- inventario_items a Operador+ habría roto en silencio el despacho normal
-- de operador_carga (el trigger interno habría quedado bloqueado por la
-- misma RLS). Tampoco sirve bloquear el UPDATE completo: syncPesoTon()
-- (lib/inventario.ts) hace un UPDATE directo de peso_ton desde el cliente
-- en reports/despacho, reports (modal rápido) y reports/[id] — rutas a las
-- que operador_carga sí tiene acceso legítimo.
--
-- La solución real: dejar que cualquier autenticado siga pudiendo editar
-- metadata del ítem (descripción, categoría, peso_ton, etc. — igual que
-- hoy), pero bloquear que stock_actual/stock_unidades/cliente_id cambien
-- por un UPDATE directo del cliente. pg_trigger_depth() = 0 identifica
-- justamente eso: un UPDATE ejecutado directo (sin estar ya dentro de otro
-- trigger) — los triggers de sincronización de stock SIEMPRE corren desde
-- dentro de otro trigger (el de reports o el de movimientos), así que
-- pg_trigger_depth() > 0 ahí y su UPDATE pasa sin problema.

CREATE OR REPLACE FUNCTION guard_inventario_items_stock_directo()
RETURNS TRIGGER AS $$
BEGIN
  -- OJO: pg_trigger_depth() medido DENTRO del propio trigger ya cuenta
  -- este trigger. Un UPDATE directo (sin trigger externo activo) da 1,
  -- no 0. Un UPDATE disparado desde sync_inventario_stock()/
  -- sync_inventario_from_movimiento() da 2. Por eso el corte es <= 1,
  -- no = 0.
  IF pg_trigger_depth() <= 1 AND (
       NEW.stock_actual   IS DISTINCT FROM OLD.stock_actual OR
       NEW.stock_unidades IS DISTINCT FROM OLD.stock_unidades OR
       NEW.cliente_id     IS DISTINCT FROM OLD.cliente_id
  ) THEN
    RAISE EXCEPTION 'stock_actual, stock_unidades y cliente_id solo cambian vía movimientos, no con un UPDATE directo del ítem';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS inventario_items_protege_stock ON inventario_items;
CREATE TRIGGER inventario_items_protege_stock
  BEFORE UPDATE ON inventario_items
  FOR EACH ROW EXECUTE FUNCTION guard_inventario_items_stock_directo();

-- INSERT: el alta de un ítem siempre parte en 0/0 en el código actual
-- (ItemFormDialog inserta stock_actual:0, stock_unidades:0 y deja que el
-- movimiento de "Saldo inicial" suba el stock vía el trigger) — se deja
-- explícito en la RLS para que un INSERT directo no pueda fabricar stock
-- de entrada. No se restringe por rol: operador_carga da de alta ítems
-- legítimamente desde el alta rápida de Bodegaje.
DROP POLICY IF EXISTS "Autenticados crean inventario" ON inventario_items;
CREATE POLICY "Autenticados crean inventario sin stock inicial directo"
  ON inventario_items FOR INSERT TO authenticated
  WITH CHECK (stock_actual = 0 AND stock_unidades = 0);
