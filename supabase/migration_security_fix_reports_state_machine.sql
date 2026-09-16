-- Fix CRÍTICO (auditoría de seguridad): reports permite INSERT/UPDATE sin
-- ninguna restricción de rol ni propiedad (schema.sql:276-283, USING(true)/
-- WITH CHECK(true) desde el origen del proyecto) — y el único guardrail que
-- quedaba, el trigger validate_report_transition(), terminó reducido a
-- no-op en migration_remove_validate_pallets_check.sql (a pedido explícito,
-- para sacar los checks de negocio de pallets/documento firmado).
--
-- No restringimos el RLS por rol porque los 3 roles (operador_carga,
-- operador, super_admin) necesitan legítimamente crear/editar reports
-- (ver ROLE_ROUTES en src/types/auth.ts — /reports, /reports/nuevo,
-- /reports/despacho están habilitados para los 3). El hueco real no es
-- "rol equivocado", es la ausencia de cualquier regla de integridad de
-- estado — cualquier autenticado podía reescribir un report YA despachado
-- (reasignar despachador, fecha, cliente, tarifa, pallets) pegándole
-- directo a la REST API, algo que la UI misma nunca permite (reports/[id]
-- ya trata "despachado" como solo-lectura — sharedReadOnly).
--
-- Este fix reinstala reglas ESTRUCTURALES (no las de negocio que se
-- sacaron a propósito):
--   1) No se puede INSERTAR un report que nazca directo en
--      'pendiente_despacho' o 'despachado', saltándose Recepción/Operaciones.
--   2) En pendiente_despacho, la UI también lo trata como solo-lectura — el
--      único cambio legítimo desde ahí es la transición final a despachado
--      (reports/despacho y el modal rápido de reports/page.tsx).
--   3) Un report ya despachado congela los campos financieros/de despacho
--      (quién/cuándo/con qué tarifa/cuántos pallets se despachó, documento
--      firmado, datos del vehículo) — pero NO todo el resto de la fila:
--      servicios-adicionales/page.tsx guarda servicios_ids/servicios_manual
--      en reports YA despachados a propósito (el revisor recién ahí marca a
--      mano qué servicio del catálogo corresponde al texto libre que
--      escribió el operador), y esa función se rompería si se bloqueara
--      cualquier UPDATE sin excepción.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado NOT IN ('borrador', 'pendiente_operaciones') THEN
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
