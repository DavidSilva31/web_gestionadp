-- Migración: nuevo input "N° Unidades" en la Sección 3 (Bodegaje) de reports,
-- asociado a un stock de unidades separado del stock de posiciones que ya
-- maneja N° Pallets. Mismo comportamiento: Ingreso suma, Despacho resta, y
-- solo se aplica cuando el report llega a 'despachado' (igual que pallets).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_numero_unidades INTEGER;

-- inventario_items.stock_actual en la práctica siempre trackeó posiciones
-- (lo mueve sec3_numero_pallets) — stock_unidades es la dimensión nueva,
-- separada, que ahora mueve sec3_numero_unidades.
ALTER TABLE inventario_items ADD COLUMN IF NOT EXISTS stock_unidades INTEGER NOT NULL DEFAULT 0;

-- ── sync_inventario_stock(): mover también stock_unidades ───────────────────
-- Mismo gate por estado='despachado' que ya tenía para stock_actual/pallets.
-- El fallback de pallets a 1 cuando es NULL ya existía antes de esta
-- migración (no se toca); unidades usa 0 como fallback — no asumir un
-- movimiento de "al menos 1 unidad" para reports que no llenen este campo
-- nuevo (todos los reports despachados antes de esta migración, por ejemplo).
CREATE OR REPLACE FUNCTION sync_inventario_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_delta_pos     INTEGER;
  v_delta_und     INTEGER;
  v_old_delta_pos INTEGER;
  v_old_delta_und INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.estado = 'despachado' AND COALESCE(OLD.sec3_activa, FALSE) AND OLD.sec3_inventario_item_id IS NOT NULL THEN
      v_old_delta_pos := COALESCE(OLD.sec3_numero_pallets, 1);
      v_old_delta_und := COALESCE(OLD.sec3_numero_unidades, 0);
      IF OLD.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_old_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_old_delta_und)
          WHERE id = OLD.sec3_inventario_item_id;
      ELSIF OLD.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_old_delta_pos,
          stock_unidades = stock_unidades + v_old_delta_und
          WHERE id = OLD.sec3_inventario_item_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'despachado' AND COALESCE(NEW.sec3_activa, FALSE) AND NEW.sec3_inventario_item_id IS NOT NULL THEN
      v_delta_pos := COALESCE(NEW.sec3_numero_pallets, 1);
      v_delta_und := COALESCE(NEW.sec3_numero_unidades, 0);
      IF NEW.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_delta_pos,
          stock_unidades = stock_unidades + v_delta_und
          WHERE id = NEW.sec3_inventario_item_id;
      ELSIF NEW.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_delta_und)
          WHERE id = NEW.sec3_inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── create_movimiento_from_report(): corrige el mapeo pallets/unidades ──────
-- Antes el movimiento auto-creado al despachar guardaba sec3_numero_pallets
-- en la columna `unidades` y nunca llenaba `posiciones` (quedaba siempre en
-- NULL) — quedaba mal etiquetado en el Kardex. Ahora que "N° Unidades" es un
-- campo real y distinto, se corrige: pallets -> posiciones, unidades -> unidades.
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
    v_tipo     := COALESCE(NEW.sec3_tipo, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := COALESCE(NEW.sec3_producto, 'Bodegaje');
    v_area     := NULL;
  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    v_area     := NULL;
  ELSE
    v_tipo     := 'ingreso';
    v_servicio := 'Almacenaje';
    v_carga    := 'Sin descripción';
    v_area     := NULL;
  END IF;

  INSERT INTO movimientos (
    tipo, servicio, cliente_id, cliente_nombre, carga, area,
    posiciones, unidades, operador, estado, fecha, report_id, created_by
  ) VALUES (
    v_tipo, v_servicio, v_cliente_id, NEW.cliente,
    v_carga, v_area,
    NEW.sec3_numero_pallets,
    NEW.sec3_numero_unidades,
    COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
    'completado',
    COALESCE(NEW.fecha_despacho, NOW()),
    NEW.id,
    NEW.dispatched_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
