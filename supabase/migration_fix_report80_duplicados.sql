-- Limpieza puntual: report 80 (GOWAN CHILE SPA) quedó con las 4 líneas de
-- Bodegaje duplicadas (doble guardado) → 8 filas en report_bodegaje_items
-- y 8 movimientos de despacho en vez de 4, duplicando el descuento de stock.
-- Deja solo la segunda copia de cada línea (la más reciente, orden 0-3) y
-- recalcula movimientos/stock desde cero con rebuild_bodegaje_movimientos().
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DO $$
DECLARE
  v_report_id UUID;
BEGIN
  SELECT id INTO v_report_id FROM reports WHERE numero = 80;

  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;
  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_resync;

  -- Borra la copia más antigua de cada orden (created_at = 12:58:09), deja la
  -- más reciente (13:02:34).
  DELETE FROM report_bodegaje_items
  WHERE report_id = v_report_id
    AND created_at = '2026-10-14T12:58:09.693448+00:00';

  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;
  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_resync;

  -- Recalcula movimientos + stock desde las 4 líneas que quedaron.
  PERFORM rebuild_bodegaje_movimientos(v_report_id);
END $$;
