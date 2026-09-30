-- Migración: cuando un super_admin o Javier Navarro edita un report YA
-- despachado (cambia productos/cantidades/lote de Bodegaje en
-- report_bodegaje_items), el sistema debe detectarlo y actualizar el stock
-- y los movimientos de inventario en consecuencia — hoy no pasaba nada:
-- create_movimiento_from_report() y el trigger de stock de reports solo
-- corren en la transición HACIA 'despachado', nunca en una edición
-- posterior mientras el report se queda despachado.
--
-- Se unifica la creación/actualización de movimientos de Bodegaje en una
-- sola función `rebuild_bodegaje_movimientos(report_id)`: revierte el stock
-- y borra los movimientos actuales de ese report, y los vuelve a crear desde
-- el estado actual de report_bodegaje_items — se llama tanto al despachar
-- por primera vez como cada vez que report_bodegaje_items cambia mientras
-- el report ya está despachado (edición de un editor total).
--
-- De paso corrige que create_movimiento_from_report() usaba
-- strip_envase_suffix() sin condición — eso volvía a juntar en un solo
-- grupo de Kardex productos que son dos ítems reales distintos por envase
-- (ej. CARBON ACTIVO Tambor/Maxisaco). Ahora solo saca el envase del nombre
-- si NO hay ambigüedad (un solo ítem de ese cliente comparte ese nombre base).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Flag de sesión para que movimientos_sync_inventario no vuelva a
-- aplicar el stock que esta función ya aplicó a mano — evita doble conteo
-- al insertar/borrar movimientos con inventario_item_id seteado.
CREATE OR REPLACE FUNCTION sync_inventario_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_delta_pos     INTEGER;
  v_delta_und     INTEGER;
  v_old_delta_pos INTEGER;
  v_old_delta_und INTEGER;
BEGIN
  IF current_setting('adp.skip_mov_stock_sync', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.inventario_item_id IS NOT NULL THEN
      v_old_delta_pos := COALESCE(OLD.posiciones, 1);
      v_old_delta_und := COALESCE(OLD.unidades, 0);
      IF OLD.tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_old_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_old_delta_und)
          WHERE id = OLD.inventario_item_id;
      ELSIF OLD.tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_old_delta_pos,
          stock_unidades = stock_unidades + v_old_delta_und
          WHERE id = OLD.inventario_item_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.inventario_item_id IS NOT NULL THEN
      v_delta_pos := COALESCE(NEW.posiciones, 1);
      v_delta_und := COALESCE(NEW.unidades, 0);
      IF NEW.tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_delta_pos,
          stock_unidades = stock_unidades + v_delta_und
          WHERE id = NEW.inventario_item_id;
      ELSIF NEW.tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_delta_und)
          WHERE id = NEW.inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 2) rebuild_bodegaje_movimientos(): única fuente de verdad para
-- movimientos + stock de Bodegaje de un report despachado.
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
BEGIN
  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND OR v_report.estado <> 'despachado' OR NOT COALESCE(v_report.sec3_activa, FALSE) THEN
    RETURN;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = v_report.cliente LIMIT 1;

  PERFORM set_config('adp.skip_mov_stock_sync', '1', true);

  -- Revertir el stock de los movimientos actuales de este report (ellos
  -- mismos guardan el delta con el que se aplicó, sin necesidad de volver a
  -- leer report_bodegaje_items) y borrarlos.
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

  -- Recrear desde el estado actual de report_bodegaje_items.
  FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = p_report_id ORDER BY orden LOOP
    v_carga := COALESCE(v_item.sec3_producto, 'Bodegaje');
    -- Solo sacar el envase del nombre si es inofensivo: si más de un ítem de
    -- este cliente comparte el mismo nombre base (ej. "CARBON ACTIVO"
    -- Tambor/Maxisaco), mantenerlo completo para no volver a mezclarlos en
    -- un solo grupo de Kardex.
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

-- ── 3) create_movimiento_from_report(): el branch de Bodegaje ahora solo
-- llama a rebuild_bodegaje_movimientos() — sec1/sec2/else quedan iguales.
CREATE OR REPLACE FUNCTION create_movimiento_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    PERFORM rebuild_bodegaje_movimientos(NEW.id);

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
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 4) sync_bodegaje_stock_on_reports_change(): se le saca el branch de
-- "aplicar" (otro estado -> despachado) porque ahora lo hace
-- rebuild_bodegaje_movimientos() desde create_movimiento_from_report() —
-- dejarlo también acá aplicaría el stock dos veces. El branch de "revertir"
-- (despachado -> otro estado, ej. al anular) queda igual.
CREATE OR REPLACE FUNCTION sync_bodegaje_stock_on_reports_change()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'despachado' AND NEW.estado <> 'despachado' THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = OLD.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF OLD.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
    DELETE FROM movimientos WHERE report_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 5) Trigger nuevo: report_bodegaje_items cambia mientras el report ya
-- está despachado (edición de un editor total) -> resync completo. No pasa
-- nada si el report no está despachado (rebuild_bodegaje_movimientos
-- retorna de inmediato), así que es seguro que corra en cada guardado
-- normal también.
CREATE OR REPLACE FUNCTION resync_bodegaje_on_item_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM rebuild_bodegaje_movimientos(COALESCE(NEW.report_id, OLD.report_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS report_bodegaje_items_resync ON report_bodegaje_items;
CREATE TRIGGER report_bodegaje_items_resync
  AFTER INSERT OR UPDATE OR DELETE ON report_bodegaje_items
  FOR EACH ROW EXECUTE FUNCTION resync_bodegaje_on_item_change();
