-- Limpieza puntual: report 80 (GOWAN CHILE SPA) quedó con las 4 líneas de
-- Bodegaje duplicadas (doble guardado) → 8 filas en report_bodegaje_items
-- y 8 movimientos de despacho en vez de 4, duplicando el descuento de stock.
-- Deja solo la segunda copia de cada línea (la más reciente, orden 0-3) y
-- recalcula movimientos/stock desde cero con rebuild_bodegaje_movimientos().
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- OJO: no desactivar report_bodegaje_items_resync — rebuild_bodegaje_movimientos()
-- solo puede tocar stock_actual/stock_unidades si pg_trigger_depth() > 1
-- (guard_inventario_items_stock_directo, migration_inventario_items_protege_stock.sql),
-- es decir, solo si se invoca DESDE otro trigger. Llamarlo a mano en un
-- DO block top-level (depth 0) lo bloquea. Dejando el trigger de resync
-- activo, el DELETE de abajo lo dispara en el contexto correcto solo.
DO $$
DECLARE
  v_report_id UUID;
BEGIN
  SELECT id INTO v_report_id FROM reports WHERE numero = 80;

  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;

  -- Borra la copia más antigua de cada orden (created_at = 12:58:09), deja la
  -- más reciente (13:02:34). El trigger report_bodegaje_items_resync (sigue
  -- activo) dispara rebuild_bodegaje_movimientos() solo, ya en contexto de
  -- trigger.
  DELETE FROM report_bodegaje_items
  WHERE report_id = v_report_id
    AND created_at = '2026-10-14T12:58:09.693448+00:00';

  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;
END $$;
