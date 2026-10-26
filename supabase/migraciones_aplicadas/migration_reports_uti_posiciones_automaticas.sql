-- UTI Chile: posiciones automáticas por pallet en los reports (para el HES).
--
-- UTI se factura por posiciones (pallets) y por clase IMO, pero su formulario no pide posiciones. Al
-- despachar el report, rebuild_bodegaje_movimientos() las calcula sola para los productos que traen N° de
-- pallet (solo UTI):
--   * Ingreso: si el pallet no tenía stock (nuevo, o ya vaciado), suma 1 posición en la línea de la clase más
--     cara de ese pallet en el report (empate: la primera).
--   * Despacho: las líneas descuentan solo unidades (posiciones = 0). Si el pallet queda en 0 unidades, se
--     agrega un movimiento aparte de 0 unidades y 1 posición, en la clase y producto del ingreso que la
--     registró, para que el HES la libere en la clase correcta. Ese movimiento queda oculto en el
--     Detalle del inventario (columna oculto), pero cuenta en el HES.
-- El resto de los clientes no cambia: sin N° de pallet se usa N° Posición como siempre.
--
-- Base: migration_reports_bodegaje_pallet_rack.sql (la última). Requiere haber ejecutado antes
-- migration_uti_posiciones_clase_mas_cara.sql (función uti_tarifa_clase), que se repite aquí por si acaso.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

BEGIN;

CREATE OR REPLACE FUNCTION uti_tarifa_clase(p_imo TEXT)
RETURNS NUMERIC AS $$
  SELECT CASE
    WHEN btrim(COALESCE(p_imo, '')) ~ '^2\.1' THEN 0.029
    WHEN btrim(COALESCE(p_imo, '')) ~ '^(3|5)' THEN 0.022
    WHEN btrim(COALESCE(p_imo, '')) ~ '^9'     THEN 0.010
    WHEN btrim(COALESCE(p_imo, '')) ~ '^8'     THEN 0.011
    ELSE 0.007
  END
$$ LANGUAGE sql IMMUTABLE;

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
  -- Posiciones automáticas por pallet (UTI Chile)
  v_pallet      TEXT;
  v_pos         INTEGER;
  v_neto_antes  INTEGER;
  v_total_desp  INTEGER;
  v_portador    UUID;
  v_primero     UUID;
  v_liberar     BOOLEAN;
  v_rel         RECORD;
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
    -- Posiciones: lo normal es lo que digita el usuario (N° Posición). Los productos con N° de pallet
    -- (UTI Chile no usa posiciones) las calculan solas, y solo para el HES:
    --  * Ingreso: si el pallet no tenía stock, suma 1 posición, en la línea de la clase más cara.
    --  * Despacho: si el pallet queda en 0 unidades, resta 1 posición (movimiento aparte, de 0 unidades,
    --    en la clase del ingreso que la registró). Las líneas despachadas descuentan solo unidades.
    v_pos := COALESCE(v_item.sec3_numero_pallets, 0);
    v_liberar := FALSE;
    v_pallet := NULLIF(btrim(v_item.sec3_numero_pallet), '');
    IF v_pallet IS NOT NULL AND v_cliente_id IS NOT NULL THEN
      v_pos := 0;
      -- Stock del pallet antes de este report (los movimientos de este report ya se borraron arriba).
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN COALESCE(unidades, 0) ELSE -COALESCE(unidades, 0) END), 0)
        INTO v_neto_antes
        FROM movimientos WHERE cliente_id = v_cliente_id AND numero_pallet = v_pallet;

      IF v_report.sec3_tipo = 'ingreso' THEN
        IF v_neto_antes <= 0 THEN
          SELECT id INTO v_portador FROM report_bodegaje_items
           WHERE report_id = p_report_id AND NULLIF(btrim(sec3_numero_pallet), '') = v_pallet
           ORDER BY uti_tarifa_clase(sec3_clase_imo) DESC, orden ASC LIMIT 1;
          IF v_portador = v_item.id THEN v_pos := 1; END IF;
        END IF;
      ELSIF v_report.sec3_tipo = 'despacho' THEN
        SELECT COALESCE(SUM(sec3_numero_unidades), 0) INTO v_total_desp FROM report_bodegaje_items
         WHERE report_id = p_report_id AND NULLIF(btrim(sec3_numero_pallet), '') = v_pallet;
        SELECT id INTO v_primero FROM report_bodegaje_items
         WHERE report_id = p_report_id AND NULLIF(btrim(sec3_numero_pallet), '') = v_pallet
         ORDER BY orden ASC LIMIT 1;
        IF v_neto_antes > 0 AND v_neto_antes - v_total_desp <= 0 AND v_primero = v_item.id THEN
          v_liberar := TRUE;
        END IF;
      END IF;
    END IF;

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
          stock_actual   = stock_actual + v_pos,
          stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
          WHERE id = v_item.sec3_inventario_item_id;
      ELSIF v_report.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_pos),
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
      v_pos,
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

    IF v_liberar THEN
      -- La posición la tiene el ingreso que la registró: se libera en su producto y en su clase IMO.
      SELECT m.inventario_item_id, m.carga, m.imo, m.un, m.codigo, m.bodega, m.rack INTO v_rel
        FROM movimientos m
       WHERE m.cliente_id = v_cliente_id AND m.numero_pallet = v_pallet
         AND m.tipo = 'ingreso' AND COALESCE(m.posiciones, 0) > 0
       ORDER BY m.fecha DESC, m.numero DESC LIMIT 1;

      IF v_rel.inventario_item_id IS NOT NULL THEN
        UPDATE inventario_items SET stock_actual = GREATEST(0, stock_actual - 1) WHERE id = v_rel.inventario_item_id;
      END IF;

      -- oculto: no se muestra en el Detalle del inventario (es solo la posición para el HES).
      INSERT INTO movimientos (
        tipo, servicio, cliente_id, cliente_nombre, carga, area,
        inventario_item_id, posiciones, unidades, codigo, imo, un, bodega, numero_pallet, rack,
        operador, estado, fecha, report_id, created_by, tarifa_cliente_id, oculto, observaciones
      ) VALUES (
        'despacho', 'Almacenaje', v_cliente_id, v_report.cliente,
        COALESCE(v_rel.carga, v_carga), NULL,
        COALESCE(v_rel.inventario_item_id, v_item.sec3_inventario_item_id), 1, 0,
        COALESCE(v_rel.codigo, v_codigo),
        COALESCE(v_rel.imo, NULLIF(btrim(v_item.sec3_clase_imo), '')),
        COALESCE(v_rel.un, NULLIF(btrim(v_item.sec3_nu), '')),
        COALESCE(v_rel.bodega, NULLIF(btrim(v_item.sec3_numero_bodega), '')),
        v_pallet, COALESCE(v_rel.rack, NULLIF(btrim(v_item.sec3_rack), '')),
        COALESCE(v_report.nombre_despachador, v_report.nombre_operador),
        'completado',
        COALESCE(v_report.fecha_despacho, NOW()),
        p_report_id, v_report.dispatched_by, v_item.tarifa_cliente_id, TRUE,
        'Libera la posición del pallet ' || v_pallet
      );
    END IF;
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

DO $$
DECLARE v_def TEXT := pg_get_functiondef('rebuild_bodegaje_movimientos(uuid)'::regprocedure);
BEGIN
  IF position('v_liberar' IN v_def) = 0 OR position('uti_tarifa_clase' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rebuild_bodegaje_movimientos no quedó actualizada';
  END IF;
END $$;

COMMIT;
