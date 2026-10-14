-- Migración: el modal de despacho ya no pide subir un documento firmado
-- (documento_firmado_url) — ahora solo pide el nombre del despachador. Se
-- elimina el chequeo de validate_report_transition() que exigía
-- documento_firmado_url para pasar a 'despachado' (ya no aplica).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'borrador' ELSE OLD.estado END;
BEGIN
  IF NEW.estado = 'pendiente_despacho' AND v_old_estado <> 'pendiente_despacho'
     AND COALESCE(NEW.sec3_activa, FALSE)
     AND (NEW.sec3_numero_pallets IS NULL OR NEW.sec3_numero_pallets <= 0) THEN
    RAISE EXCEPTION 'Bodegaje activo requiere sec3_numero_pallets > 0 al enviar a despacho';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
