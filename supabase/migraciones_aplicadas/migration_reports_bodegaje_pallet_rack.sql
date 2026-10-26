-- UTI Chile trabaja por N° de pallet y rack en vez de posiciones: el producto de Bodegaje de un report
-- guarda su pallet y su rack, y al despachar el report esos datos pasan al movimiento (columnas
-- movimientos.numero_pallet y movimientos.rack, que el Detalle del inventario ya muestra).
--
-- 1) report_bodegaje_items.sec3_numero_pallet y sec3_rack (texto; un pallet puede ser "401/403").
-- 2) rebuild_bodegaje_movimientos(): idéntica a la última versión (migration_reports_sec1_segundo_contenedor.sql)
--    salvo que el movimiento de cada producto copia numero_pallet y rack. Requiere haber ejecutado
--    antes migration_movimientos_rack.sql (columna movimientos.rack).
-- Para el resto de los clientes no cambia nada: esos campos van vacíos.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

BEGIN;

ALTER TABLE report_bodegaje_items ADD COLUMN IF NOT EXISTS sec3_numero_pallet TEXT;
ALTER TABLE report_bodegaje_items ADD COLUMN IF NOT EXISTS sec3_rack          TEXT;

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
  v_sigla       TEXT;
  v_sigla2      TEXT;
  v_s           TEXT;
  v_cont_item_id UUID;
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

  -- Siglas de los contenedores si el producto llegó/sale en 20ft/40ft.
  v_sigla := NULL; v_sigla2 := NULL;
  IF COALESCE(v_report.sec1_activa, FALSE) AND v_report.sec1_tipo_contenedor IN ('20ft', '40ft') THEN
    v_sigla  := NULLIF(btrim(v_report.sec1_sigla), '');
    v_sigla2 := NULLIF(btrim(v_report.sec1_sigla_2), '');
  END IF;

  v_transporte := CASE
    WHEN v_sigla IS NOT NULL OR v_sigla2 IS NOT NULL THEN concat_ws(' / ', v_sigla, v_sigla2)
    WHEN v_report.transporte_tipo = 'propio' THEN 'ADP'
    ELSE NULLIF(btrim(v_report.empresa_transporte), '')
  END;

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
    IF v_item.sec3_inventario_item_id IS NOT NULL THEN
      SELECT descripcion INTO v_descripcion_real FROM inventario_items WHERE id = v_item.sec3_inventario_item_id;
    ELSE
      v_descripcion_real := NULL;
    END IF;

    IF v_descripcion_real IS NOT NULL THEN
      v_carga := v_descripcion_real;
    ELSE
      v_carga := COALESCE(v_item.sec3_producto, 'Bodegaje');
      v_stripped := strip_envase_suffix(v_carga);
      IF v_stripped IS DISTINCT FROM v_carga AND v_cliente_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count_base FROM inventario_items
          WHERE cliente_id = v_cliente_id AND strip_envase_suffix(descripcion) = v_stripped;
        IF v_count_base <= 1 THEN v_carga := v_stripped; END IF;
      END IF;
    END IF;

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
      codigo, imo, un, bodega, numero_pallet, rack, tipo_envase, transporte, peso_envase,
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
      NULLIF(btrim(v_item.sec3_numero_pallet), ''),
      NULLIF(btrim(v_item.sec3_rack), ''),
      v_envase,
      v_transporte,
      v_item.sec3_peso_neto,
      COALESCE(v_report.nombre_despachador, v_report.nombre_operador),
      'completado',
      COALESCE(v_report.fecha_despacho, NOW()),
      p_report_id, v_report.dispatched_by, v_item.tarifa_cliente_id
    );
  END LOOP;

  -- Contenedor(es) que ingresan con el producto: cada uno queda registrado como
  -- producto "CONTENEDORES" con su sigla de SKU.
  IF (v_sigla IS NOT NULL OR v_sigla2 IS NOT NULL)
     AND COALESCE(v_report.sec1_tipo_movimiento, 'ingreso') = 'ingreso'
     AND v_cliente_id IS NOT NULL THEN
    SELECT id INTO v_cont_item_id
      FROM inventario_items
     WHERE cliente_id = v_cliente_id
       AND descripcion = 'CONTENEDORES'
       AND categoria = 'Contenedor IMO'
     LIMIT 1;

    IF v_cont_item_id IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cliente_id, 'CONTENEDORES', 'Contenedor IMO', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_cont_item_id;
    END IF;

    FOREACH v_s IN ARRAY ARRAY[v_sigla, v_sigla2] LOOP
      IF v_s IS NOT NULL THEN
        UPDATE inventario_items SET stock_actual = stock_actual + 1, stock_unidades = stock_unidades + 1
          WHERE id = v_cont_item_id;

        INSERT INTO movimientos (
          tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
          posiciones, unidades, codigo, tipo_envase,
          operador, estado, fecha, report_id, created_by, tarifa_cliente_id
        ) VALUES (
          'ingreso', 'Almacenaje', v_cliente_id, v_report.cliente, 'CONTENEDORES', 'Zona Isotanques', v_cont_item_id,
          1, 1, v_s,
          CASE WHEN v_report.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
          COALESCE(v_report.nombre_despachador, v_report.nombre_operador), 'completado',
          COALESCE(v_report.fecha_despacho, NOW()), p_report_id, v_report.dispatched_by, v_report.tarifa_cliente_id
        );
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: la función quedó con las columnas nuevas y la tabla las tiene
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name = 'report_bodegaje_items' AND column_name IN ('sec3_numero_pallet', 'sec3_rack')) <> 2 THEN
    RAISE EXCEPTION 'Faltan las columnas sec3_numero_pallet / sec3_rack en report_bodegaje_items';
  END IF;
  IF position('numero_pallet' IN pg_get_functiondef('rebuild_bodegaje_movimientos(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rebuild_bodegaje_movimientos no quedó actualizada';
  END IF;
END $$;

COMMIT;
