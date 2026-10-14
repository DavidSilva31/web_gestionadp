-- Estado "en_proceso" para reports de Depósito de Contenedores con 20ft o 40ft
-- SIN "Almacenaje Full" ni "Almacenaje Vacío" (ver migration_reports_sec1_almacenaje.sql).
--
-- En ese caso el operador debe llenar después el consolidado/desconsolidado
-- (proceso largo), así que el camión no puede esperar: al despacharlo en
-- portería el report pasa a 'en_proceso' (en vez de 'despachado'), con su PDF y
-- sello ya disponibles. Operaciones completa la información y lo cierra desde
-- el detalle del report ("Finalizar"): recién ahí pasa a 'despachado' y los
-- triggers existentes generan movimientos, stock y transporte (no cambian: ya
-- se disparan en la transición HACIA 'despachado', venga de donde venga).
-- Isotanque, y 20ft/40ft con Almacenaje Full o Vacío (contenedor entero, como un
-- isotanque), no cambian: se cierran al despachar el camión, como siempre.
--
-- Esta migración hace dos cosas:
--   1) Agrega 'en_proceso' a la lista de estados permitidos.
--   2) validate_report_transition(): un report en 'pendiente_despacho' ahora
--      también puede pasar a 'en_proceso' (antes solo a 'despachado').
--      El resto de la función es idéntico a la de migration_reports_anular.sql.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Estados permitidos ──────────────────────────────────────────────────
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_estado_check;
ALTER TABLE reports ADD CONSTRAINT reports_estado_check
  CHECK (estado IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho', 'en_proceso', 'despachado', 'anulado'));

-- ── 2) Transición pendiente_despacho → en_proceso ──────────────────────────
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_permitidas TEXT[] := ARRAY[
    'archivos_pendiente_despacho', 'updated_at',
    'firma_conductor_url', 'firma_recepcion_url', 'firma_bodega_url', 'firma_evidencia'
  ];
  v_permitidas_anular TEXT[] := ARRAY['estado', 'estado_previo_anulacion', 'anulado_at', 'anulado_por', 'updated_at'];
BEGIN
  -- super_admin y los editores totales editan cualquier campo en cualquier
  -- estado — incluye despachar/anular/des-anular a mano.
  IF TG_OP = 'UPDATE' AND es_editor_total_reports(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Un report anulado queda congelado para todos los demás.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'anulado' THEN
    RAISE EXCEPTION 'Un report anulado no se puede modificar (solo super_admin o Javier Navarro pueden restaurarlo)';
  END IF;

  -- Anular: transición a 'anulado' desde cualquier otro estado, tocando
  -- solo metadata de anulación. Anular un report YA despachado requiere el
  -- bypass de arriba (mueve stock/facturación real). Un report 'en_proceso'
  -- todavía no generó movimientos ni stock, así que se puede anular normal.
  IF TG_OP = 'UPDATE' AND NEW.estado = 'anulado' AND OLD.estado <> 'anulado' THEN
    IF OLD.estado = 'despachado' THEN
      RAISE EXCEPTION 'Solo un super_admin o Javier Navarro puede anular un report despachado';
    END IF;
    IF (to_jsonb(NEW) - v_permitidas_anular) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas_anular) THEN
      RAISE EXCEPTION 'Al anular un report solo puede cambiar su estado, no otros datos';
    END IF;
    RETURN NEW;
  END IF;

  -- Cambio respecto a la versión anterior: además de 'despachado', un report en
  -- pendiente_despacho puede pasar a 'en_proceso' (camión despachado, a la
  -- espera de que Operaciones complete el consolidado/desconsolidado).
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado NOT IN ('despachado', 'en_proceso') THEN
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
