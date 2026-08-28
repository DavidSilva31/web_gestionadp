-- ============================================================
-- Endurece RLS de reports/movimientos e invariantes de negocio
-- ============================================================
-- Motivo: "Autenticados actualizan reports"/"...movimientos" con
-- USING (true) dejan que CUALQUIER usuario autenticado (incluido
-- operador_carga, que ni siquiera tiene /movimientos en su menú) le
-- pegue directo a la REST API de Supabase y salte toda la validación
-- que hoy solo vive en la UI: pasar un report a 'despachado' sin subir
-- el documento firmado, activar bodegaje con 0 pallets, o escribir
-- movimientos a mano fuera de /movimientos.
--
-- Verificar antes de correr: que ningún flujo real dependa de insertar
-- reports.estado='despachado' directo sin documento_firmado_url (no
-- debería — reports/despacho siempre sube el archivo primero).

-- ── 1) reports: invariantes de negocio a nivel de BD ────────────────
-- Antes solo las validaba el frontend (reports/nuevo, reports/[id],
-- reports/despacho) — esto las hace imposibles de saltar.
-- Los dos chequeos solo se disparan en la TRANSICIÓN (comparando contra el
-- estado anterior) — si solo miraran NEW.estado, cualquier edición trivial
-- a un report viejo ya despachado (o que se quedó sin documento por datos
-- legacy) quedaría bloqueada para siempre. OLD no existe en INSERT, de ahí
-- el CASE con TG_OP.
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'borrador' ELSE OLD.estado END;
BEGIN
  IF NEW.estado = 'despachado' AND v_old_estado <> 'despachado' AND NEW.documento_firmado_url IS NULL THEN
    RAISE EXCEPTION 'No se puede despachar un report sin documento firmado';
  END IF;

  IF NEW.estado <> 'borrador' AND v_old_estado = 'borrador'
     AND COALESCE(NEW.sec3_activa, FALSE)
     AND (NEW.sec3_numero_pallets IS NULL OR NEW.sec3_numero_pallets <= 0) THEN
    RAISE EXCEPTION 'Bodegaje activo requiere sec3_numero_pallets > 0 al salir de borrador';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS validate_report_transition_trigger ON reports;
CREATE TRIGGER validate_report_transition_trigger
  BEFORE INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION validate_report_transition();

-- ── 2) movimientos: restringir escritura directa a Operador+ ────────
-- Mismo criterio que ya usan tarifas_cliente y servicios_cliente.
-- operador_carga sigue pudiendo despachar reports con normalidad (ver
-- punto 3 — el trigger que genera el movimiento corre con permisos
-- elevados, independiente de quién despache).
DROP POLICY IF EXISTS "Autenticados crean movimientos" ON movimientos;
DROP POLICY IF EXISTS "Autenticados actualizan movimientos" ON movimientos;
-- Por si un intento anterior (ej. abortado a mitad por un deadlock) ya
-- alcanzó a crear estas — hace el script re-ejecutable sin importar
-- dónde haya quedado a medio camino la corrida previa.
DROP POLICY IF EXISTS "Operador+ crean movimientos" ON movimientos;
DROP POLICY IF EXISTS "Operador+ actualizan movimientos" ON movimientos;

CREATE POLICY "Operador+ crean movimientos"
  ON movimientos FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operador+ actualizan movimientos"
  ON movimientos FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));

-- ── 3) create_movimiento_from_report: SECURITY DEFINER ───────────────
-- Sin esto, el trigger de despacho corre con los permisos de quien lo
-- dispara — si es operador_carga, la nueva política del punto 2 le
-- bloquearía el INSERT y el despacho fallaría. SECURITY DEFINER hace
-- que corra con los permisos del dueño de la función (quien ejecute esta
-- migración), que por defecto bypasea RLS al no estar
-- FORCE ROW LEVEL SECURITY activado en movimientos.
CREATE OR REPLACE FUNCTION create_movimiento_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    v_tipo     := COALESCE(NEW.sec3_tipo, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := COALESCE(NEW.sec3_producto, 'Bodegaje');
    v_area     := NULL;
  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    v_area     := NULL;
  ELSE
    v_tipo     := 'ingreso';
    v_servicio := 'Almacenaje';
    v_carga    := 'Sin descripción';
    v_area     := NULL;
  END IF;

  INSERT INTO movimientos (
    tipo, servicio, cliente_id, cliente_nombre, carga, area,
    unidades, operador, estado, fecha, report_id, created_by
  ) VALUES (
    v_tipo, v_servicio, v_cliente_id, NEW.cliente,
    v_carga, v_area,
    NEW.sec3_numero_pallets,
    COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
    'completado',
    COALESCE(NEW.fecha_despacho, NOW()),
    NEW.id,
    NEW.dispatched_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
