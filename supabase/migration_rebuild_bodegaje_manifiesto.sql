-- Los movimientos que se generan al despachar un report con Bodegaje quedaban
-- con campos vacíos en la grilla de Detalle del inventario aunque el report sí
-- los tenía: SKU, Clase IMO, NU, Bodega, Envase y Transporte.
--
-- Causa: rebuild_bodegaje_movimientos() (la función que arma esos movimientos
-- al despachar y al editar un report ya despachado) solo copiaba lote, CAS,
-- guía, OC y fechas de elaboración/vencimiento. Clase IMO, NU y N° de bodega
-- se guardan en report_bodegaje_items, pero nunca se pasaban al movimiento.
--
-- Cambios:
--   1) rebuild_bodegaje_movimientos() ahora también completa:
--        imo      <- clase IMO del producto en el report
--        un       <- NU del producto en el report
--        bodega   <- N° de bodega del producto en el report
--        codigo   <- SKU del ítem de inventario (o, si no tiene, el último código
--                    que tuvo en otro movimiento)
--        tipo_envase <- envase del ítem (su "unidad", si es un envase válido) o el
--                    último envase que tuvo en otro movimiento
--        transporte  <- 'ADP' si el report es Transporte ADP; si no, la empresa de
--                    transporte del report
--      Base: definición de migration_fix_default_pallets_bodegaje.sql (la última);
--      el resto de la función queda idéntico.
--   2) Relleno de los movimientos que ya existen: SOLO completa campos que están
--      vacíos, nunca pisa un dato que alguien ya haya escrito o corregido a mano
--      en la grilla. No cambia stock.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Función ─────────────────────────────────────────────────────────────
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
    v_carga := COALESCE(v_item.sec3_producto, 'Bodegaje');
    v_stripped := strip_envase_suffix(v_carga);
    IF v_stripped IS DISTINCT FROM v_carga AND v_cliente_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count_base FROM inventario_items
        WHERE cliente_id = v_cliente_id AND strip_envase_suffix(descripcion) = v_stripped;
      IF v_count_base <= 1 THEN v_carga := v_stripped; END IF;
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
      codigo, imo, un, bodega, tipo_envase, transporte,
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
      COALESCE(v_report.nombre_despachador, v_report.nombre_operador),
      'completado',
      COALESCE(v_report.fecha_despacho, NOW()),
      p_report_id, v_report.dispatched_by, v_item.tarifa_cliente_id
    );
  END LOOP;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2) Relleno de movimientos ya generados (solo campos vacíos) ────────────
DO $$
BEGIN
  -- Los UPDATE de movimientos dispararían el trigger de stock; como acá no
  -- cambia ninguna cantidad, se desactiva para no tocar el stock.
  PERFORM set_config('adp.skip_mov_stock_sync', '1', true);

  -- Clase IMO, NU y bodega: los que se llenaron en el producto del report.
  UPDATE movimientos m SET
    imo    = COALESCE(m.imo,    NULLIF(btrim(i.sec3_clase_imo), '')),
    un     = COALESCE(m.un,     NULLIF(btrim(i.sec3_nu), '')),
    bodega = COALESCE(m.bodega, NULLIF(btrim(i.sec3_numero_bodega), ''))
  FROM report_bodegaje_items i
  WHERE m.report_id = i.report_id
    AND m.inventario_item_id IS NOT DISTINCT FROM i.sec3_inventario_item_id
    AND m.lote IS NOT DISTINCT FROM i.sec3_lote
    AND (m.imo IS NULL OR m.un IS NULL OR m.bodega IS NULL);

  -- SKU: el código del ítem de inventario.
  UPDATE movimientos m SET codigo = NULLIF(btrim(it.codigo), '')
  FROM inventario_items it
  WHERE m.report_id IS NOT NULL
    AND m.codigo IS NULL
    AND m.inventario_item_id = it.id
    AND NULLIF(btrim(it.codigo), '') IS NOT NULL;

  -- Envase: el del ítem, cuando es un envase válido.
  UPDATE movimientos m SET tipo_envase = it.unidad
  FROM inventario_items it
  WHERE m.report_id IS NOT NULL
    AND m.tipo_envase IS NULL
    AND m.inventario_item_id = it.id
    AND it.unidad IN ('Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Maxisaco','Tineta','Cilindro','Cuñete','Otro');

  -- Transporte: ADP si el report era Transporte ADP; si no, su empresa de transporte.
  UPDATE movimientos m SET
    transporte = CASE WHEN r.transporte_tipo = 'propio' THEN 'ADP'
                      ELSE NULLIF(btrim(r.empresa_transporte), '') END
  FROM reports r
  WHERE m.report_id = r.id
    AND r.sec3_activa
    AND m.transporte IS NULL;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END $$;
