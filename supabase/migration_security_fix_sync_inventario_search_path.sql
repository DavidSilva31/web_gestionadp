-- Fix MEDIO (auditoría de seguridad): sync_inventario_stock() tenía
-- search_path fijado por un ALTER FUNCTION suelto (supabase_security_fixes.sql,
-- 2026-07-08), pero dos migraciones posteriores la redefinieron con
-- CREATE OR REPLACE FUNCTION sin repetir la cláusula SET — en Postgres eso
-- borra lo que el ALTER FUNCTION había fijado. No es SECURITY DEFINER hoy
-- (corre con permisos del invocador, no hay escalamiento de privilegio
-- directo), pero reabre la superficie de search_path hijacking que el fix
-- original cerraba, y deja un patrón frágil para el futuro. Reproduce el
-- cuerpo real vigente (migration_reports_sec3_unidades.sql, la última que
-- la tocó) agregando la cláusula SET.

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
$$ LANGUAGE plpgsql SET search_path = public;
