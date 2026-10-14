-- Sección 1 — Depósito de Contenedores: hasta 2 contenedores por report.
--
-- Un camión puede ingresar o despachar 1 o 2 contenedores en el mismo report.
-- El segundo lleva su propia sigla e interchange (el tipo 20ft/40ft/isotanque,
-- Almacenaje, horas y Clase IMO/NU son compartidos entre ambos).
--
-- Cambios:
--   1) reports.sec1_sigla_2 y reports.sec1_interchange_2 (NULL = un solo contenedor).
--   2) create_movimiento_from_report(): las ramas de isotanque y de contenedor
--      entero (Almacenaje Full/Vacío) registran un movimiento por contenedor.
--      Base: migration_reports_contenedores.sql (la última).
--   3) rebuild_bodegaje_movimientos(): Transporte del producto = las siglas
--      ("SIGLA1 / SIGLA2") y, en un ingreso, se registra cada contenedor como
--      producto CONTENEDORES. Base: migration_bodegaje_contenedor_transporte_y_sku.sql
--      (la última).
--   4) Transporte Incomex: su trigger sigue tomando la primera sigla; un trigger
--      aparte (zz_..., corre al final) la reemplaza por "SIGLA1 / SIGLA2" cuando
--      hay segundo contenedor, sin tocar la definición del trigger original.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Columnas ────────────────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec1_sigla_2       TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec1_interchange_2 TEXT;

-- ── 2) Trigger de despacho ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_movimiento_from_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
  v_item_id  UUID;
  v_sigla2   TEXT := NULLIF(btrim(NEW.sec1_sigla_2), '');
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    PERFORM rebuild_bodegaje_movimientos(NEW.id);

  ELSIF NEW.sec1_activa AND NEW.sec1_tipo_contenedor = 'isotanque' THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';

    SELECT id INTO v_item_id
      FROM inventario_items
     WHERE cliente_id = v_cliente_id
       AND descripcion = 'ISOTANQUE'
       AND categoria = 'Isotanque'
     LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cliente_id, 'ISOTANQUE', 'Isotanque', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_item_id;
    END IF;

    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                             posiciones, unidades, codigo, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'ISOTANQUE', 'Zona Isotanques', v_item_id,
            1, 1, NEW.sec1_sigla, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
            COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

    IF v_sigla2 IS NOT NULL THEN
      INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                               posiciones, unidades, codigo, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
      VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'ISOTANQUE', 'Zona Isotanques', v_item_id,
              1, 1, v_sigla2, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
              COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
    END IF;

  -- Contenedor 20ft/40ft entero (Almacenaje Full o Vacío): una unidad del
  -- producto "CONTENEDORES" por contenedor, con su sigla como SKU.
  ELSIF NEW.sec1_activa AND NEW.sec1_tipo_contenedor IN ('20ft', '40ft') AND NEW.sec1_almacenaje IS NOT NULL THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';

    SELECT id INTO v_item_id
      FROM inventario_items
     WHERE cliente_id = v_cliente_id
       AND descripcion = 'CONTENEDORES'
       AND categoria = 'Contenedor IMO'
     LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cliente_id, 'CONTENEDORES', 'Contenedor IMO', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_item_id;
    END IF;

    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                             posiciones, unidades, codigo, tipo_envase, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'CONTENEDORES', 'Zona Isotanques', v_item_id,
            1, 1, NEW.sec1_sigla,
            CASE WHEN NEW.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
            COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
            COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

    IF v_sigla2 IS NOT NULL THEN
      INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                               posiciones, unidades, codigo, tipo_envase, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
      VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'CONTENEDORES', 'Zona Isotanques', v_item_id,
              1, 1, v_sigla2,
              CASE WHEN NEW.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
              COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
              COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
    END IF;

  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, v_area, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSE
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES ('ingreso', 'Almacenaje', v_cliente_id, NEW.cliente, 'Sin descripción', NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3) Producto en Bodegaje dentro de contenedor(es) ───────────────────────
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

-- ── 4) Transporte Incomex: "SIGLA1 / SIGLA2" si hay segundo contenedor ─────
CREATE OR REPLACE FUNCTION zz_transporte_incomex_sigla_2()
RETURNS TRIGGER AS $$
BEGIN
  IF NULLIF(btrim(NEW.sec1_sigla_2), '') IS NOT NULL THEN
    UPDATE transporte_incomex
       SET sigla_contenedor = concat_ws(' / ', NULLIF(btrim(NEW.sec1_sigla), ''), NULLIF(btrim(NEW.sec1_sigla_2), ''))
     WHERE report_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS zz_reports_transporte_incomex_sigla_2 ON reports;
CREATE TRIGGER zz_reports_transporte_incomex_sigla_2
  AFTER INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION zz_transporte_incomex_sigla_2();
