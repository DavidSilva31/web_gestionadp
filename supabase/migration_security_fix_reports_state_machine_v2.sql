-- Ajuste sobre migration_security_fix_reports_state_machine.sql (ya
-- corrida): esa migración bloqueaba INSERTAR un report directo en
-- 'pendiente_despacho', pensado como guardrail de seguridad — pero ahora
-- es un flujo legítimo: reports/nuevo/page.tsx crea directo en
-- 'pendiente_despacho' cuando la única sección activa es Depósito de
-- Contenedores (Sección 1) con Ingreso/Despacho elegido — esa operación no
-- necesita pasar por Operaciones (no hay Bodegaje/Consolidado de por
-- medio), así que "Ingresar report" ya la deja lista para la cola de
-- despacho. Se mantiene el bloqueo real que importaba: no se puede
-- INSERTAR un report que nazca ya 'despachado'.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado NOT IN ('borrador', 'pendiente_operaciones', 'pendiente_despacho') THEN
    RAISE EXCEPTION 'Un report nuevo no puede crearse directo en estado %', NEW.estado;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado <> 'despachado' THEN
    RAISE EXCEPTION 'Un report en pendiente_despacho solo se puede modificar para despacharlo';
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
