-- Contenedores 20ft / 40ft con "Almacenaje Full" o "Almacenaje Vacío" (Sección 1):
-- se ingresa o despacha el contenedor ENTERO, igual que un isotanque. Cada
-- contenedor es una unidad con su sigla (sec1_sigla), que hace de SKU, y se
-- lleva como el producto "CONTENEDORES" del cliente: un ingreso suma 1 y un
-- despacho resta 1 (lo calcula el trigger de stock de movimientos,
-- sync_inventario_from_movimiento). El movimiento guarda en "envase" si es
-- Full o Vacío (se ve en la columna Envase del Detalle del inventario).
--
-- Un 20ft/40ft SIN Almacenaje Full/Vacío no entra en esta rama: sigue como
-- hasta ahora (movimiento genérico) y pasa por Operaciones (estado en_proceso).
--
-- Dos cambios:
--   1) movimientos.tipo_envase acepta además 'Full' y 'Vacío'.
--   2) create_movimiento_from_report(): rama nueva para contenedores.
--      Base: definición de migration_reports_isotanque.sql (la última); solo se
--      agrega la rama de contenedores — el resto queda idéntico.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Envase: también Full / Vacío ────────────────────────────────────────
ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_tipo_envase_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_envase_check
  CHECK (tipo_envase IS NULL OR tipo_envase IN (
    'Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Maxisaco','Tineta','Cilindro','Cuñete','Otro',
    'Full','Vacío'
  ));

-- ── 2) Trigger de despacho ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_movimiento_from_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
  v_item_id  UUID;
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    PERFORM rebuild_bodegaje_movimientos(NEW.id);

  ELSIF NEW.sec1_activa AND NEW.sec1_tipo_contenedor = 'isotanque' THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';

    SELECT id INTO v_item_id
      FROM inventario_items
     WHERE cliente_id = v_cliente_id
       AND descripcion = 'ISOTANQUE'
       AND categoria = 'Isotanque'
     LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cliente_id, 'ISOTANQUE', 'Isotanque', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_item_id;
    END IF;

    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                             posiciones, unidades, codigo, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'ISOTANQUE', 'Zona Isotanques', v_item_id,
            1, 1, NEW.sec1_sigla, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
            COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  -- Contenedor 20ft/40ft entero (Almacenaje Full o Vacío): se cuenta como una
  -- unidad del producto "CONTENEDORES", con su sigla como SKU.
  ELSIF NEW.sec1_activa AND NEW.sec1_tipo_contenedor IN ('20ft', '40ft') AND NEW.sec1_almacenaje IS NOT NULL THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';

    SELECT id INTO v_item_id
      FROM inventario_items
     WHERE cliente_id = v_cliente_id
       AND descripcion = 'CONTENEDORES'
       AND categoria = 'Contenedor IMO'
     LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cliente_id, 'CONTENEDORES', 'Contenedor IMO', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_item_id;
    END IF;

    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                             posiciones, unidades, codigo, tipo_envase, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'CONTENEDORES', 'Zona Isotanques', v_item_id,
            1, 1, NEW.sec1_sigla,
            CASE WHEN NEW.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
            COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
            COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, v_area, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSE
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES ('ingreso', 'Almacenaje', v_cliente_id, NEW.cliente, 'Sin descripción', NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
  END IF;

  RETURN NEW;
END;
$function$;
