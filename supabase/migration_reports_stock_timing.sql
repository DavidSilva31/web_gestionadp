-- Corrige el timing del vínculo report → stock: hoy sync_inventario_stock()
-- movía stock en CUALQUIER insert/update con sec3 activa (incluyendo
-- borrador), no solo al despachar. Se agrega el mismo gate por estado que
-- ya usa create_movimiento_from_report. Además, guardrail estructural
-- contra doble conteo entre reports y movimientos.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION sync_inventario_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_delta     INTEGER;
  v_old_delta INTEGER;
BEGIN
  -- Revertir el efecto de un OLD que ya estaba despachado (UPDATE o DELETE)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.estado = 'despachado' AND COALESCE(OLD.sec3_activa, FALSE) AND OLD.sec3_inventario_item_id IS NOT NULL THEN
      v_old_delta := COALESCE(OLD.sec3_numero_pallets, 1);
      IF OLD.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items
          SET stock_actual = GREATEST(0, stock_actual - v_old_delta)
          WHERE id = OLD.sec3_inventario_item_id;
      ELSIF OLD.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items
          SET stock_actual = stock_actual + v_old_delta
          WHERE id = OLD.sec3_inventario_item_id;
      END IF;
    END IF;
  END IF;

  -- Aplicar el efecto de un NEW que queda despachado (INSERT o UPDATE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'despachado' AND COALESCE(NEW.sec3_activa, FALSE) AND NEW.sec3_inventario_item_id IS NOT NULL THEN
      v_delta := COALESCE(NEW.sec3_numero_pallets, 1);
      IF NEW.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items
          SET stock_actual = stock_actual + v_delta
          WHERE id = NEW.sec3_inventario_item_id;
      ELSIF NEW.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items
          SET stock_actual = GREATEST(0, stock_actual - v_delta)
          WHERE id = NEW.sec3_inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- El trigger reports_sync_inventario existente ya apunta a esta función
-- (CREATE OR REPLACE la reemplaza sin tocar el trigger).

ALTER TABLE movimientos ADD CONSTRAINT movimientos_no_doble_conteo
  CHECK (report_id IS NULL OR inventario_item_id IS NULL);
