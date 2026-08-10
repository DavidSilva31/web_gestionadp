-- Migración: vincula cada movimiento (y cada report) a una tarifa/clase
-- específica del cliente, para clientes con más de un contrato en paralelo
-- (ej. PROQUIMIN: CARGA NORMAL, CLASE IMO 3, 4.2, 8, 9, LOSA ISOTANQUES).
-- Sin esto, el HES agregaba TODOS los movimientos del cliente sin importar
-- a qué tarifa correspondían, mezclando pallets de productos distintos en
-- cada HES. Confirmado con prueba E2E antes de este fix.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS tarifa_cliente_id UUID REFERENCES tarifas_cliente(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mov_tarifa_cliente ON movimientos(tarifa_cliente_id);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS tarifa_cliente_id UUID REFERENCES tarifas_cliente(id) ON DELETE SET NULL;

-- El trigger que auto-crea un movimiento al despachar un report ahora
-- propaga la tarifa elegida en el report hacia el movimiento generado.
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
    unidades, operador, estado, fecha, report_id, created_by, tarifa_cliente_id
  ) VALUES (
    v_tipo, v_servicio, v_cliente_id, NEW.cliente,
    v_carga, v_area,
    NEW.sec3_numero_pallets,
    COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
    'completado',
    COALESCE(NEW.fecha_despacho, NOW()),
    NEW.id,
    NEW.dispatched_by,
    NEW.tarifa_cliente_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
