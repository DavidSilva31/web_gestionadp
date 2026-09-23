-- Migración: los reports se anulan, nunca se eliminan (para no perder nada
-- del historial/auditoría), y super_admin + Javier Navarro (operador) pueden
-- editar cualquier campo de un report sin importar su estado, incluido
-- despacharlo/anularlo/des-anularlo.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Columnas de anulación ──────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS anulado_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS anulado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- Estado justo antes de anularse — permite "des-anular" restaurándolo
-- exactamente a donde estaba (en vez de adivinar a qué estado volver).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS estado_previo_anulacion TEXT;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_estado_check;
ALTER TABLE reports ADD CONSTRAINT reports_estado_check
  CHECK (estado IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho', 'despachado', 'anulado'));

-- ── 2) Helper: usuario con permiso de edición total sobre reports ────
-- super_admin, o Javier Navarro (operador) por asignación específica.
-- Si el permiso debe extenderse a otro usuario, agregar su UUID acá.
CREATE OR REPLACE FUNCTION es_editor_total_reports(p_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = p_uid AND role = 'super_admin')
    OR p_uid = 'd0ef84af-0d9b-43b6-83bf-76f5b99b7e6f'::uuid -- Javier Navarro
$$ LANGUAGE sql STABLE SET search_path = public;

-- ── 3) validate_report_transition(): bypass total + manejo de anulación ──
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_permitidas TEXT[] := ARRAY[
    'archivos_pendiente_despacho', 'updated_at',
    'firma_conductor_url', 'firma_recepcion_url', 'firma_bodega_url', 'firma_evidencia'
  ];
  v_permitidas_anular TEXT[] := ARRAY['estado', 'estado_previo_anulacion', 'anulado_at', 'anulado_por', 'updated_at'];
BEGIN
  -- super_admin y Javier Navarro editan cualquier campo en cualquier
  -- estado — incluye despachar/anular/des-anular a mano.
  IF TG_OP = 'UPDATE' AND es_editor_total_reports(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Un report anulado queda congelado para todos los demás.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'anulado' THEN
    RAISE EXCEPTION 'Un report anulado no se puede modificar (solo super_admin o Javier Navarro pueden restaurarlo)';
  END IF;

  -- Anular: transición a 'anulado' desde cualquier otro estado, tocando
  -- solo metadata de anulación — nunca se pierde ni se mezcla con otros
  -- cambios. Anular un report YA despachado requiere el bypass de arriba
  -- (mueve stock/facturación real), así que acá solo llegan los demás casos.
  IF TG_OP = 'UPDATE' AND NEW.estado = 'anulado' AND OLD.estado <> 'anulado' THEN
    IF OLD.estado = 'despachado' THEN
      RAISE EXCEPTION 'Solo un super_admin o Javier Navarro puede anular un report despachado';
    END IF;
    IF (to_jsonb(NEW) - v_permitidas_anular) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas_anular) THEN
      RAISE EXCEPTION 'Al anular un report solo puede cambiar su estado, no otros datos';
    END IF;
    RETURN NEW;
  END IF;

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

-- ── 4) lock_bodegaje_items_if_despachado(): bypass + también congela anulado ──
CREATE OR REPLACE FUNCTION lock_bodegaje_items_if_despachado()
RETURNS TRIGGER AS $$
DECLARE
  v_report_id UUID := COALESCE(NEW.report_id, OLD.report_id);
  v_estado    TEXT;
BEGIN
  IF es_editor_total_reports(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT estado INTO v_estado FROM reports WHERE id = v_report_id;
  IF v_estado IN ('despachado', 'anulado') THEN
    RAISE EXCEPTION 'Un report despachado o anulado no permite modificar sus productos de Bodegaje';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 5) sync_bodegaje_stock_on_reports_change(): el revert (despachado →
-- cualquier otro estado) ahora SÍ es alcanzable — es justo lo que pasa al
-- anular un report despachado. Junto con revertir el stock, borra los
-- movimientos que ese despacho había auto-generado (si no, Kardex/HES los
-- seguirían contando aunque el report ya esté anulado). Si más adelante se
-- des-anula de vuelta a "despachado", la rama de abajo y
-- create_movimiento_from_report() vuelven a aplicar el stock y regeneran
-- los movimientos solos.
CREATE OR REPLACE FUNCTION sync_bodegaje_stock_on_reports_change()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'despachado' AND NEW.estado <> 'despachado' THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = OLD.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF OLD.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
    DELETE FROM movimientos WHERE report_id = OLD.id;
  END IF;

  -- Aplicar: transición HACIA despachado.
  IF NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado' AND COALESCE(NEW.sec3_activa, FALSE) THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = NEW.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF NEW.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF NEW.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 6) Reports ya no se eliminan desde la app — solo se anulan. La app deja
-- de ofrecer "Eliminar"; esto lo blinda también a nivel de base de datos.
-- (Un DELETE hecho a mano en el SQL Editor sigue funcionando: corre como
-- superusuario y no pasa por RLS — sigue siendo la única vía para una
-- limpieza de datos real, como la de hoy con el report de prueba #5.)
DROP POLICY IF EXISTS "Eliminar reports" ON reports;
CREATE POLICY "Reports no se eliminan desde la app"
  ON reports FOR DELETE TO authenticated
  USING (false);
