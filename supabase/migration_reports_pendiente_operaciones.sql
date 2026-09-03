-- Migración: nuevo estado intermedio "pendiente_operaciones" en reports.
-- Antes el flujo era borrador (todo editable) -> pendiente_despacho (todo
-- bloqueado). Ahora se separa en dos turnos: Recepción llena Antecedentes +
-- Sección 1 (Depósito de Contenedores) y guarda -> el report pasa a
-- "pendiente_operaciones", esa mitad queda bloqueada y se habilitan la
-- Sección 2 (Consolidado/Desconsolidado/Otros) y la Sección 3 (Bodegaje)
-- para que Operaciones las complete. Al guardar esa segunda mitad, el
-- report pasa a "pendiente_despacho" igual que antes.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_estado_check;
ALTER TABLE reports ADD CONSTRAINT reports_estado_check
  CHECK (estado IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho', 'despachado'));

-- El chequeo de "pallets > 0 si Bodegaje está activo" antes se disparaba al
-- SALIR de 'borrador' (única transición hacia adelante que existía). Ahora
-- Bodegaje (sec3) lo llena Operaciones recién en pendiente_operaciones, así
-- que el chequeo debe correr al ENTRAR a 'pendiente_despacho' (la transición
-- donde sec3 ya debería estar completo), sin importar desde qué estado venga.
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'borrador' ELSE OLD.estado END;
BEGIN
  IF NEW.estado = 'despachado' AND v_old_estado <> 'despachado' AND NEW.documento_firmado_url IS NULL THEN
    RAISE EXCEPTION 'No se puede despachar un report sin documento firmado';
  END IF;

  IF NEW.estado = 'pendiente_despacho' AND v_old_estado <> 'pendiente_despacho'
     AND COALESCE(NEW.sec3_activa, FALSE)
     AND (NEW.sec3_numero_pallets IS NULL OR NEW.sec3_numero_pallets <= 0) THEN
    RAISE EXCEPTION 'Bodegaje activo requiere sec3_numero_pallets > 0 al enviar a despacho';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
