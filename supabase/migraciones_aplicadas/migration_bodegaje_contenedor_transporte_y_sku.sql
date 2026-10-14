-- Report con contenedor 20ft/40ft (Sección 1) + producto en Bodegaje (Sección 3).
--
-- Problema (report #71, REFRIGERANTE en contenedor 40ft CMAU662191-0):
--   a) La columna Transporte del movimiento del producto copiaba el texto
--      libre "Nombre de Empresa Transporte" ("CLIENTE"), cuando el producto en
--      realidad llegó dentro de un contenedor.
--   b) El contenedor no quedaba registrado: create_movimiento_from_report()
--      entra a la rama de Bodegaje y se salta la de contenedores, así que hubo
--      que cargar a mano una fila 0/0 con la sigla.
--
-- Cambios en rebuild_bodegaje_movimientos() (base: la versión de
-- migration_fix_bodegaje_carga_item_vinculado.sql, la última):
--   1) Transporte = sigla del contenedor cuando la Sección 1 es 20ft/40ft y
--      tiene sigla. Si no, igual que antes (ADP / empresa de transporte).
--   2) En un INGRESO con contenedor 20ft/40ft + sigla, además de los productos
--      se registra el contenedor como una unidad del producto "CONTENEDORES"
--      del cliente (mismo producto que ya usa Almacenaje Full/Vacío), con la
--      sigla como SKU, para poder despacharlo después al retirarse. Envase:
--      Full/Vacío según "Almacenaje" si se marcó; si no, "Vacío" (el producto
--      ya se descargó a bodega). El contenedor queda dentro del rebuild porque
--      este borra y recrea TODOS los movimientos del report: así una edición
--      posterior no lo pierde ni lo duplica.
--
-- Al final recalcula el report #71 con la lógica nueva.
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
  v_sigla       TEXT;
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

  -- Sigla del contenedor si el producto llegó/sale en un 20ft/40ft.
  v_sigla := NULL;
  IF COALESCE(v_report.sec1_activa, FALSE) AND v_report.sec1_tipo_contenedor IN ('20ft', '40ft') THEN
    v_sigla := NULLIF(btrim(v_report.sec1_sigla), '');
  END IF;

  v_transporte := CASE
    WHEN v_sigla IS NOT NULL THEN v_sigla
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

  -- Contenedor que ingresa con el producto: queda registrado como producto
  -- "CONTENEDORES" con su sigla de SKU (ver cabecera).
  IF v_sigla IS NOT NULL
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

    UPDATE inventario_items SET stock_actual = stock_actual + 1, stock_unidades = stock_unidades + 1
      WHERE id = v_cont_item_id;

    INSERT INTO movimientos (
      tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
      posiciones, unidades, codigo, tipo_envase,
      operador, estado, fecha, report_id, created_by, tarifa_cliente_id
    ) VALUES (
      'ingreso', 'Almacenaje', v_cliente_id, v_report.cliente, 'CONTENEDORES', 'Zona Isotanques', v_cont_item_id,
      1, 1, v_sigla,
      CASE WHEN v_report.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
      COALESCE(v_report.nombre_despachador, v_report.nombre_operador), 'completado',
      COALESCE(v_report.fecha_despacho, NOW()), p_report_id, v_report.dispatched_by, v_report.tarifa_cliente_id
    );
  END IF;

  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recalcula el report #71 con la lógica nueva. En el SQL Editor auth.uid() es
-- NULL (no pasa el bypass de editor_total), así que se desactiva el candado
-- un instante; el trigger de resync sigue activo para que el rebuild corra
-- desde dentro de un trigger, como exige el guardrail de stock.
ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;

UPDATE report_bodegaje_items SET updated_at = NOW()
WHERE report_id = (SELECT id FROM reports WHERE numero = 71);

ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;
