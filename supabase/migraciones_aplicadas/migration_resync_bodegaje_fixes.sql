-- Ajustes a migration_resync_bodegaje_despachado.sql (correr después de esa):
--
-- 1) rebuild_bodegaje_movimientos(): si el report no tiene ninguna fila en
-- report_bodegaje_items (reports muy antiguos, de antes de existir esa
-- tabla — ej. report #2), no hacer nada. Sin este guard, el rebuild
-- borraría el movimiento legado de ese report y no recrearía nada (el FOR
-- loop no itera), perdiendo el registro en silencio.
--
-- 2) Backfill: movimientos de reports ya despachados ANTES de esta
-- migración quedaron con inventario_item_id NULL (convención vieja) — sin
-- esto, la primera edición de un editor total sobre esos reports no podría
-- revertir su efecto de stock viejo al recalcular (rebuild solo revierte
-- movimientos que SÍ tienen inventario_item_id), aplicando el nuevo encima
-- del viejo en vez de reemplazarlo. Se vincula por (report_id, lote,
-- posiciones, unidades) contra report_bodegaje_items — sin tocar stock,
-- solo la etiqueta (el stock de estos movimientos ya se aplicó
-- correctamente cuando se despacharon).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION rebuild_bodegaje_movimientos(p_report_id UUID)
RETURNS VOID AS $$
DECLARE
  v_report   RECORD;
  v_item     RECORD;
  v_old_mov  RECORD;
  v_cliente_id UUID;
  v_carga    TEXT;
  v_stripped TEXT;
  v_count_base INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND OR v_report.estado <> 'despachado' OR NOT COALESCE(v_report.sec3_activa, FALSE) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_item_count FROM report_bodegaje_items WHERE report_id = p_report_id;
  IF v_item_count = 0 THEN
    -- Report legado sin ítems estructurados (de antes de report_bodegaje_items)
    -- — no hay nada que reconstruir, dejar su movimiento tal cual está.
    RETURN;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = v_report.cliente LIMIT 1;

  PERFORM set_config('adp.skip_mov_stock_sync', '1', true);

  FOR v_old_mov IN SELECT * FROM movimientos WHERE report_id = p_report_id LOOP
    IF v_old_mov.inventario_item_id IS NOT NULL THEN
      IF v_old_mov.tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - COALESCE(v_old_mov.posiciones, 0)),
          stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_old_mov.unidades, 0))
          WHERE id = v_old_mov.inventario_item_id;
      ELSIF v_old_mov.tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + COALESCE(v_old_mov.posiciones, 0),
          stock_unidades = stock_unidades + COALESCE(v_old_mov.unidades, 0)
          WHERE id = v_old_mov.inventario_item_id;
      END IF;
    END IF;
  END LOOP;
  DELETE FROM movimientos WHERE report_id = p_report_id;

  FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = p_report_id ORDER BY orden LOOP
    v_carga := COALESCE(v_item.sec3_producto, 'Bodegaje');
    v_stripped := strip_envase_suffix(v_carga);
    IF v_stripped IS DISTINCT FROM v_carga AND v_cliente_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count_base FROM inventario_items
        WHERE cliente_id = v_cliente_id AND strip_envase_suffix(descripcion) = v_stripped;
      IF v_count_base <= 1 THEN v_carga := v_stripped; END IF;
    END IF;

    IF v_item.sec3_inventario_item_id IS NOT NULL THEN
      IF v_report.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
          stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
          WHERE id = v_item.sec3_inventario_item_id;
      ELSIF v_report.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
          stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
          WHERE id = v_item.sec3_inventario_item_id;
      END IF;
    END IF;

    INSERT INTO movimientos (
      tipo, servicio, cliente_id, cliente_nombre, carga, area,
      inventario_item_id, posiciones, unidades, lote, cas, guia_numero, orden_compra,
      fecha_elaboracion, fecha_vencimiento,
      operador, estado, fecha, report_id, created_by, tarifa_cliente_id
    ) VALUES (
      COALESCE(v_report.sec3_tipo, 'ingreso'), 'Almacenaje', v_cliente_id, v_report.cliente,
      v_carga, NULL,
      v_item.sec3_inventario_item_id,
      COALESCE(v_item.sec3_numero_pallets, 1),
      COALESCE(v_item.sec3_numero_unidades, 0),
      v_item.sec3_lote, v_item.sec3_cas, v_report.sec3_numero_guia, v_item.sec3_orden_compra,
      v_item.sec3_fecha_elaboracion, v_item.sec3_fecha_vencimiento,
      COALESCE(v_report.nombre_despachador, v_report.nombre_operador),
      'completado',
      COALESCE(v_report.fecha_despacho, NOW()),
      p_report_id, v_report.dispatched_by, v_item.tarifa_cliente_id
    );
  END LOOP;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Sacar el guardrail viejo "un movimiento de report nunca lleva
-- inventario_item_id" (migration_reports_stock_timing.sql) — existía porque
-- antes había DOS caminos separados aplicando stock desde un mismo report
-- (sync_inventario_stock() sobre reports directamente + el movimiento
-- auto-creado), y si el movimiento también hubiera tenido item_id el
-- trigger de movimientos lo habría contado una tercera vez. Ese camino viejo
-- (sync_inventario_stock/reports_sync_inventario) ya no existe — desde
-- migration_report_bodegaje_items.sql el único que mueve stock es
-- rebuild_bodegaje_movimientos(), que ahora sí necesita que el movimiento
-- lleve su item_id (para poder revertir su propio efecto en una edición
-- posterior) y usa el flag adp.skip_mov_stock_sync para que
-- movimientos_sync_inventario no lo cuente aparte.
ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_no_doble_conteo;

-- ── Backfill: vincular por (report_id, lote, posiciones, unidades) ─────
-- Flag prendido sin "local" (persiste más allá de este statement dentro de
-- la misma sesión/script) para que el UPDATE no dispare de nuevo el stock
-- vía movimientos_sync_inventario — ya se aplicó cuando se despachó.
SELECT set_config('adp.skip_mov_stock_sync', '1', false);

UPDATE movimientos m
SET inventario_item_id = rbi.sec3_inventario_item_id
FROM report_bodegaje_items rbi
WHERE m.report_id IS NOT NULL
  AND m.inventario_item_id IS NULL
  AND rbi.report_id = m.report_id
  AND rbi.sec3_lote IS NOT DISTINCT FROM m.lote
  AND rbi.sec3_numero_pallets IS NOT DISTINCT FROM m.posiciones
  AND rbi.sec3_numero_unidades IS NOT DISTINCT FROM m.unidades
  AND rbi.sec3_inventario_item_id IS NOT NULL;

SELECT set_config('adp.skip_mov_stock_sync', '0', false);
