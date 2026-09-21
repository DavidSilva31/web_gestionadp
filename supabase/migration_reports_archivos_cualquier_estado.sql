-- Archivos adjuntos en cualquier estado del report (detalle /reports/[id]).
--
-- validate_report_transition() (migration_security_fix_reports_state_machine_v2.sql)
-- rechazaba TODO UPDATE de un report en 'pendiente_despacho' cuyo NEW.estado no
-- fuera 'despachado' — incluso uno que dejaba el estado igual. Eso impedía
-- agregar/quitar archivos (reports.archivos_pendiente_despacho) mientras el
-- report espera despacho. Se mantiene el guardrail real: en pendiente_despacho
-- solo se puede (a) despachar o (b) cambiar la lista de archivos — cualquier
-- otro campo sigue congelado.
--
-- En 'despachado' ya se permitía tocar archivos (no está en la lista congelada),
-- y en borrador / pendiente_operaciones nunca hubo restricción.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado NOT IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho') THEN
    RAISE EXCEPTION 'Un report nuevo no puede crearse directo en estado %', NEW.estado;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado <> 'despachado' THEN
    -- Mismo estado: solo se acepta si lo único que cambió es la lista de
    -- archivos (updated_at lo mueve otro trigger, por eso se ignora).
    IF NEW.estado <> OLD.estado
       OR (to_jsonb(NEW) - 'archivos_pendiente_despacho' - 'updated_at')
          IS DISTINCT FROM
          (to_jsonb(OLD) - 'archivos_pendiente_despacho' - 'updated_at') THEN
      RAISE EXCEPTION 'Un report en pendiente_despacho solo se puede modificar para despacharlo';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'despachado' AND (
       NEW.estado                    IS DISTINCT FROM OLD.estado OR
       NEW.dispatched_by             IS DISTINCT FROM OLD.dispatched_by OR
       NEW.fecha_despacho            IS DISTINCT FROM OLD.fecha_despacho OR
       NEW.documento_firmado_url     IS DISTINCT FROM OLD.documento_firmado_url OR
       NEW.nombre_despachador        IS DISTINCT FROM OLD.nombre_despachador OR
       NEW.cliente                   IS DISTINCT FROM OLD.cliente OR
       NEW.tarifa_cliente_id         IS DISTINCT FROM OLD.tarifa_cliente_id OR
       NEW.patente                   IS DISTINCT FROM OLD.patente OR
       NEW.conductor                 IS DISTINCT FROM OLD.conductor OR
       NEW.rut_conductor             IS DISTINCT FROM OLD.rut_conductor OR
       NEW.sec3_tipo                 IS DISTINCT FROM OLD.sec3_tipo OR
       NEW.sec3_numero_pallets       IS DISTINCT FROM OLD.sec3_numero_pallets OR
       NEW.sec3_numero_unidades      IS DISTINCT FROM OLD.sec3_numero_unidades OR
       NEW.sec3_inventario_item_id   IS DISTINCT FROM OLD.sec3_inventario_item_id
  ) THEN
    RAISE EXCEPTION 'Un report ya despachado no permite modificar datos de despacho/facturación/stock';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
