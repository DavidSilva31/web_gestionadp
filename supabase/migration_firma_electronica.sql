-- Firma electrónica de reports: conductor (en pantalla), Recepción y encargado
-- de bodega (firma guardada en su perfil, aplicada con un clic). Cada firma
-- lleva evidencia: fecha/hora, usuario que la aplicó, IP, huella SHA-256 del
-- contenido del report y de la imagen de firma.
--
--   profiles.firma_url            firma guardada del usuario (Configuración → Mi firma)
--   reports.firma_recepcion_url   copia de la firma de Recepción al firmar ese report
--   reports.firma_bodega_url      copia de la firma del encargado de bodega
--   reports.firma_evidencia       {"conductor": {...}, "recepcion": {...}, "bodega": {...}}
--
-- La firma se registra siempre desde /api/reports/firmar (service role): el
-- navegador ya no escribe las columnas de firma directo.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS firma_url TEXT;
ALTER TABLE reports  ADD COLUMN IF NOT EXISTS firma_recepcion_url TEXT;
ALTER TABLE reports  ADD COLUMN IF NOT EXISTS firma_bodega_url TEXT;
ALTER TABLE reports  ADD COLUMN IF NOT EXISTS firma_evidencia JSONB;

-- validate_report_transition(): reemplaza la versión de
-- migration_reports_archivos_cualquier_estado.sql.
--   * pendiente_despacho: además de la lista de archivos, ahora se permite
--     cambiar las firmas (un report que nace directo en pendiente_despacho —
--     solo Sección 1 — nunca pasa por Operaciones y no habría cómo firmarlo).
--   * despachado: las firmas quedan congeladas junto al resto de los datos.
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  -- Columnas que pueden cambiar sin salir de pendiente_despacho.
  v_permitidas TEXT[] := ARRAY[
    'archivos_pendiente_despacho', 'updated_at',
    'firma_conductor_url', 'firma_recepcion_url', 'firma_bodega_url', 'firma_evidencia'
  ];
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado NOT IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho') THEN
    RAISE EXCEPTION 'Un report nuevo no puede crearse directo en estado %', NEW.estado;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado <> 'despachado' THEN
    -- Mismo estado: solo se acepta si lo único que cambió son archivos o firmas
    -- (updated_at lo mueve otro trigger, por eso se ignora).
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
       NEW.sec3_numero_pallets       IS DISTINCT FROM OLD.sec3_numero_pallets OR
       NEW.sec3_numero_unidades      IS DISTINCT FROM OLD.sec3_numero_unidades OR
       NEW.sec3_inventario_item_id   IS DISTINCT FROM OLD.sec3_inventario_item_id OR
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
