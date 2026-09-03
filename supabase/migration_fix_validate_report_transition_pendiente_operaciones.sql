-- Fix: validate_report_transition() (migration_rls_reports_movimientos_hardening.sql)
-- quedó desactualizado por el rediseño en dos fases de reports (Recepción
-- llena Antecedentes+Sección 1 y pasa a 'pendiente_operaciones'; Operaciones
-- completa Bodegaje y envía a 'pendiente_despacho'). El chequeo de
-- "sec3_numero_pallets > 0" solo disparaba al salir de 'borrador', pero esa
-- ya no es la transición real que necesita bodegaje completo — ahora es
-- pendiente_operaciones -> pendiente_despacho. Con el estado nuevo, la
-- validación de BD había dejado de proteger nada (cualquiera podía pasar a
-- pendiente_despacho con 0 pallets pegándole directo a la REST API,
-- exactamente el hueco que este trigger existía para cerrar).
--
-- Fix: en vez de atarse a un nombre de estado "de origen" específico (que ya
-- cambió una vez y puede volver a cambiar), el chequeo ahora es sobre la
-- transición real que le importa a la regla de negocio: entrar a
-- 'pendiente_despacho' viniendo de cualquier otro estado.

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
    RAISE EXCEPTION 'Bodegaje activo requiere sec3_numero_pallets > 0 antes de enviar a despacho';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
