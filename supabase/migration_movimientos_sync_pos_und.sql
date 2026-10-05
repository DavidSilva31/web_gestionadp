-- sync_inventario_from_movimiento() movía stock_actual con `unidades` y nunca
-- tocaba stock_unidades. Ahora sigue el mismo criterio que sync_inventario_stock()
-- (reports): stock_actual ← posiciones, stock_unidades ← unidades.
--
-- OJO: un movimiento sin `posiciones` ya no mueve stock_actual. Revisar que los
-- flujos manuales de movimientos envíen posiciones antes de usar esta migración.

CREATE OR REPLACE FUNCTION sync_inventario_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_delta_pos INTEGER;
  v_delta_und INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.inventario_item_id IS NOT NULL THEN
      v_delta_pos := COALESCE(OLD.posiciones, 0);
      v_delta_und := COALESCE(OLD.unidades, 0);
      IF OLD.tipo = 'ingreso' THEN
        UPDATE inventario_items
           SET stock_actual   = GREATEST(0, stock_actual - v_delta_pos),
               stock_unidades = GREATEST(0, stock_unidades - v_delta_und)
         WHERE id = OLD.inventario_item_id;
      ELSIF OLD.tipo = 'despacho' THEN
        UPDATE inventario_items
           SET stock_actual   = stock_actual + v_delta_pos,
               stock_unidades = stock_unidades + v_delta_und
         WHERE id = OLD.inventario_item_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.inventario_item_id IS NOT NULL THEN
      v_delta_pos := COALESCE(NEW.posiciones, 0);
      v_delta_und := COALESCE(NEW.unidades, 0);
      IF NEW.tipo = 'ingreso' THEN
        UPDATE inventario_items
           SET stock_actual   = stock_actual + v_delta_pos,
               stock_unidades = stock_unidades + v_delta_und
         WHERE id = NEW.inventario_item_id;
      ELSIF NEW.tipo = 'despacho' THEN
        UPDATE inventario_items
           SET stock_actual   = GREATEST(0, stock_actual - v_delta_pos),
               stock_unidades = GREATEST(0, stock_unidades - v_delta_und)
         WHERE id = NEW.inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;
