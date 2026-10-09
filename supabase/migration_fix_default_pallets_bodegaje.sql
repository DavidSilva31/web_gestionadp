-- Fix: "N° Pallets" vacío en Bodegaje se interpretaba como 1 pallet en vez
-- de 0 — varias funciones usaban COALESCE(sec3_numero_pallets, 1) /
-- COALESCE(posiciones, 1), asumiendo que "sin dato" = "al menos un pallet".
-- Pero 0 pallets es un estado válido (ej. despacho de solo unidades sueltas,
-- sin pallet, como un cilindro), así que el default correcto es 0, no 1.
-- Solo cambia el cálculo — no toca datos existentes.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

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
      v_old_delta_pos := COALESCE(OLD.posiciones, 0);
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
      v_delta_pos := COALESCE(NEW.posiciones, 0);
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
      operador, estado, fecha, report_id, created_by, tarifa_cliente_id
    ) VALUES (
      COALESCE(v_report.sec3_tipo, 'ingreso'), 'Almacenaje', v_cliente_id, v_report.cliente,
      v_carga, NULL,
      v_item.sec3_inventario_item_id,
      COALESCE(v_item.sec3_numero_pallets, 0),
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
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 0)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 0),
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

CREATE OR REPLACE FUNCTION sync_bodegaje_stock_on_reports_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF OLD.estado = 'despachado' AND COALESCE(OLD.sec3_activa, FALSE) THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = OLD.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF OLD.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 0)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 0),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;
