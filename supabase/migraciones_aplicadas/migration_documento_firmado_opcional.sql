-- El documento firmado (PDF/foto del report firmado por el conductor) deja
-- de ser obligatorio para despachar. Hasta ahora validate_report_transition()
-- bloqueaba CUALQUIER despacho sin documento_firmado_url, incluido el modal
-- rápido de despacho en /reports (que nunca subió un documento, por diseño)
-- y ahora también el flujo completo en /reports/despacho, donde subirlo pasa
-- a ser opcional en la UI. Se mantiene el resto de invariantes intactas.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'borrador' ELSE OLD.estado END;
  v_permitidas TEXT[] := ARRAY[
    'archivos_pendiente_despacho', 'updated_at',
    'firma_conductor_url', 'firma_recepcion_url', 'firma_bodega_url', 'firma_evidencia'
  ];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado <> 'despachado' THEN
    IF NEW.estado <> OLD.estado
       OR (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
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
       NEW.firma_conductor_url       IS DISTINCT FROM OLD.firma_conductor_url OR
       NEW.firma_recepcion_url       IS DISTINCT FROM OLD.firma_recepcion_url OR
       NEW.firma_bodega_url          IS DISTINCT FROM OLD.firma_bodega_url OR
       NEW.firma_evidencia           IS DISTINCT FROM OLD.firma_evidencia
  ) THEN
    RAISE EXCEPTION 'Un report ya despachado no permite modificar datos de despacho/facturación/stock ni firmas';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
