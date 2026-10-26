-- El trigger de stock de movimientos (movimientos_sync_inventario) se dispara hoy en CUALQUIER
-- UPDATE de un movimiento, aunque solo cambie un texto (lote, código, bodega, nombre del producto).
-- En cada UPDATE la función revierte el movimiento y lo vuelve a aplicar con GREATEST(0, ...), lo
-- que deja el stock MÁS ALTO en productos ya despachados total o parcialmente (por ejemplo, un
-- producto con stock 0 y 3 ingresos pasa a stock 3 al cambiarles solo el texto).
--
-- Se limita el trigger a las columnas que de verdad mueven stock: tipo, unidades, posiciones e
-- inventario_item_id. Editar cualquier otra celda del Detalle (o renombrar un producto) deja de
-- tocar el stock. INSERT y DELETE siguen igual.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

BEGIN;

DROP TRIGGER IF EXISTS movimientos_sync_inventario ON movimientos;

CREATE TRIGGER movimientos_sync_inventario
  AFTER INSERT OR DELETE OR UPDATE OF tipo, unidades, posiciones, inventario_item_id ON movimientos
  FOR EACH ROW EXECUTE FUNCTION sync_inventario_from_movimiento();

-- Verificación: el trigger existe y solo escucha esas columnas en UPDATE
DO $$
DECLARE v_def TEXT;
BEGIN
  SELECT pg_get_triggerdef(oid) INTO v_def FROM pg_trigger
  WHERE tgname = 'movimientos_sync_inventario' AND tgrelid = 'movimientos'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%UPDATE OF%' THEN
    RAISE EXCEPTION 'Verificación fallida: %', COALESCE(v_def, 'el trigger no existe');
  END IF;
END $$;

COMMIT;

SELECT pg_get_triggerdef(oid) AS definicion FROM pg_trigger
WHERE tgname = 'movimientos_sync_inventario' AND tgrelid = 'movimientos'::regclass;
