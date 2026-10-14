-- Migración: nuevos inputs de manifiesto/lote en la Sección 3 (Bodegaje) de
-- reports — Lote, CAS, OC (Orden de Compra), Elab. (Fecha Elaboración) y
-- Venc. (Fecha Vencimiento) — para que el movimiento que se auto-genera al
-- despachar quede con la misma información que un movimiento cargado a mano
-- desde /movimientos (que ya tiene estos campos). N° Guía NO es un input
-- nuevo acá: se reusa sec3_numero_guia (ya vive en Antecedentes) para llenar
-- movimientos.guia_numero, que hoy queda sin usar en el movimiento
-- auto-generado.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_lote               TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_cas                TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_orden_compra       TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_fecha_elaboracion  DATE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_fecha_vencimiento  DATE;

-- ── create_movimiento_from_report(): propaga manifiesto + guía ──────────────
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
    posiciones, unidades, lote, cas, guia_numero, orden_compra,
    fecha_elaboracion, fecha_vencimiento,
    operador, estado, fecha, report_id, created_by
  ) VALUES (
    v_tipo, v_servicio, v_cliente_id, NEW.cliente,
    v_carga, v_area,
    NEW.sec3_numero_pallets,
    NEW.sec3_numero_unidades,
    NEW.sec3_lote,
    NEW.sec3_cas,
    NEW.sec3_numero_guia,
    NEW.sec3_orden_compra,
    NEW.sec3_fecha_elaboracion,
    NEW.sec3_fecha_vencimiento,
    COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
    'completado',
    COALESCE(NEW.fecha_despacho, NOW()),
    NEW.id,
    NEW.dispatched_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
