-- Fix: despacho de un producto con lote (report #82, DYFLOC (EPIPAC) (IBC))
-- quedó como un ítem "fantasma" en el Kardex, con stock negativo, separado
-- del ítem real.
--
-- Causa: rebuild_bodegaje_movimientos() arma el texto `carga` del movimiento
-- desde sec3_producto y le saca el sufijo de envase (ej. "(IBC)") con
-- strip_envase_suffix() cuando no detecta ambigüedad — pensado para unificar
-- variantes/typos históricos. Pero no distingue el caso en que el texto
-- completo YA es el nombre real y único del ítem catalogado: ahí igual lo
-- recortaba, dejando `carga` = "DYFLOC (EPIPAC)" en vez de
-- "DYFLOC (EPIPAC) (IBC)". El stock del ítem real (ligado por
-- inventario_item_id) se actualizaba bien — el problema era solo el texto
-- `carga`, que el Kardex usa para agrupar, mostrando un grupo fantasma sin
-- relación visual con el ítem real.
--
-- Fix: cuando el producto del report SÍ tiene sec3_inventario_item_id
-- vinculado, usar directamente la descripción real de ese ítem como
-- `carga` — sin heurística de stripping, porque ya se sabe con certeza cuál
-- ítem es. El stripping queda solo para el caso legado sin ítem vinculado
-- (texto libre, sin match de catálogo).
--
-- Esto garantiza que, en el flujo normal (producto elegido desde el catálogo
-- vía ProductoCombobox — que siempre fija sec3_inventario_item_id), el texto
-- del movimiento SIEMPRE coincide exacto con el nombre del ítem, sin importar
-- cuántos paréntesis/envases tenga. No cubre el caso de texto libre sin
-- ítem vinculado (ahí no hay URL de stock real de todas formas).
--
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
  v_codigo      TEXT;
  v_envase      TEXT;
  v_unidad      TEXT;
  v_transporte  TEXT;
  v_descripcion_real TEXT;
BEGIN
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND OR v_report.estado <> 'despachado' OR NOT COALESCE(v_report.sec3_activa, FALSE) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_item_count FROM report_bodegaje_items WHERE report_id = p_report_id;
  IF v_item_count = 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = v_report.cliente LIMIT 1;

  v_transporte := CASE WHEN v_report.transporte_tipo = 'propio' THEN 'ADP'
                       ELSE NULLIF(btrim(v_report.empresa_transporte), '') END;

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
    -- Producto con ítem de catálogo vinculado: usar su descripción real tal
    -- cual, sin heurística de stripping — ya no hay ambigüedad que resolver.
    IF v_item.sec3_inventario_item_id IS NOT NULL THEN
      SELECT descripcion INTO v_descripcion_real FROM inventario_items WHERE id = v_item.sec3_inventario_item_id;
    ELSE
      v_descripcion_real := NULL;
    END IF;

    IF v_descripcion_real IS NOT NULL THEN
      v_carga := v_descripcion_real;
    ELSE
      -- Legado: sin ítem vinculado (texto libre) — mantiene el comportamiento
      -- anterior de intentar unificar variantes de envase.
      v_carga := COALESCE(v_item.sec3_producto, 'Bodegaje');
      v_stripped := strip_envase_suffix(v_carga);
      IF v_stripped IS DISTINCT FROM v_carga AND v_cliente_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count_base FROM inventario_items
          WHERE cliente_id = v_cliente_id AND strip_envase_suffix(descripcion) = v_stripped;
        IF v_count_base <= 1 THEN v_carga := v_stripped; END IF;
      END IF;
    END IF;

    -- SKU y envase del producto: del ítem de inventario (o de su último movimiento).
    v_codigo := NULL; v_envase := NULL; v_unidad := NULL;
    IF v_item.sec3_inventario_item_id IS NOT NULL THEN
      SELECT NULLIF(btrim(codigo), ''), unidad INTO v_codigo, v_unidad
        FROM inventario_items WHERE id = v_item.sec3_inventario_item_id;
      IF v_codigo IS NULL THEN
        SELECT codigo INTO v_codigo FROM movimientos
          WHERE inventario_item_id = v_item.sec3_inventario_item_id AND codigo IS NOT NULL
          ORDER BY fecha DESC, numero DESC LIMIT 1;
      END IF;
      SELECT tipo_envase INTO v_envase FROM movimientos
        WHERE inventario_item_id = v_item.sec3_inventario_item_id AND tipo_envase IS NOT NULL
        ORDER BY fecha DESC, numero DESC LIMIT 1;
      IF v_envase IS NULL AND v_unidad IN ('Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Maxisaco','Tineta','Cilindro','Cuñete','Otro') THEN
        v_envase := v_unidad;
      END IF;

      IF v_report.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 0),
          stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
          WHERE id = v_item.sec3_inventario_item_id;
      ELSIF v_report.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 0)),
          stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
          WHERE id = v_item.sec3_inventario_item_id;
      END IF;
    END IF;

    INSERT INTO movimientos (
      tipo, servicio, cliente_id, cliente_nombre, carga, area,
      inventario_item_id, posiciones, unidades, lote, cas, guia_numero, orden_compra,
      fecha_elaboracion, fecha_vencimiento,
      codigo, imo, un, bodega, tipo_envase, transporte, peso_envase,
      operador, estado, fecha, report_id, created_by, tarifa_cliente_id
    ) VALUES (
      COALESCE(v_report.sec3_tipo, 'ingreso'), 'Almacenaje', v_cliente_id, v_report.cliente,
      v_carga, NULL,
      v_item.sec3_inventario_item_id,
      COALESCE(v_item.sec3_numero_pallets, 0),
      COALESCE(v_item.sec3_numero_unidades, 0),
      v_item.sec3_lote, v_item.sec3_cas, v_report.sec3_numero_guia, v_item.sec3_orden_compra,
      v_item.sec3_fecha_elaboracion, v_item.sec3_fecha_vencimiento,
      v_codigo,
      NULLIF(btrim(v_item.sec3_clase_imo), ''),
      NULLIF(btrim(v_item.sec3_nu), ''),
      NULLIF(btrim(v_item.sec3_numero_bodega), ''),
      v_envase,
      v_transporte,
      v_item.sec3_peso_neto,
      COALESCE(v_report.nombre_despachador, v_report.nombre_operador),
      'completado',
      COALESCE(v_report.fecha_despacho, NOW()),
      p_report_id, v_report.dispatched_by, v_item.tarifa_cliente_id
    );
  END LOOP;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recalcula el report #82 con la función ya corregida (dispara el trigger
-- de resync con un UPDATE inofensivo, en contexto de trigger como exige el
-- guardrail de stock). lock_bodegaje_items_if_despachado también hay que
-- desactivarlo: en el SQL Editor auth.uid() es NULL, no pasa el bypass de
-- editor_total.
ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;

UPDATE report_bodegaje_items SET updated_at = NOW()
WHERE report_id = (SELECT id FROM reports WHERE numero = 82);

ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;
