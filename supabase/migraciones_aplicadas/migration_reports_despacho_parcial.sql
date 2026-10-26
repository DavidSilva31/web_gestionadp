-- Despacho Parcial (Sección 1) y Parcial (Sección 2).
--
-- Caso: un contenedor llega lleno, se desconsolida en parte y se va con carga. Nunca ingresa a bodega.
--  * Sección 1 (solo en un despacho de 20ft/40ft): además de Despacho Full y Despacho Vacío, ahora hay
--    "Despacho Parcial". Se guarda como sec1_almacenaje = 'parcial'.
--  * Sección 2: opción "Parcial" (sec2_parcial) para marcar una consolidación o desconsolidación parcial.
--
-- Cambios:
--   1) reports.sec2_parcial (BOOLEAN, falso por defecto).
--   2) El CHECK de reports.sec1_almacenaje acepta también 'parcial'.
--   3) create_movimiento_from_report(): la rama del contenedor entero (producto CONTENEDORES, con su sigla)
--      ahora aplica solo a 'full' y 'vacio'. Un despacho parcial NO mueve el stock de CONTENEDORES (el
--      contenedor nunca estuvo en bodega); sigue el mismo camino que un contenedor sin Full/Vacío. Idéntica
--      a la última versión (migration_reports_sec1_segundo_contenedor.sql) salvo esa condición.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

BEGIN;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS sec2_parcial BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE v_nombre TEXT;
BEGIN
  FOR v_nombre IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.reports'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%sec1_almacenaje%'
  LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', v_nombre);
  END LOOP;
END $$;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_sec1_almacenaje_check
  CHECK (sec1_almacenaje IN ('full', 'vacio', 'parcial'));

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
  v_sigla2   TEXT := NULLIF(btrim(NEW.sec1_sigla_2), '');
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

    IF v_sigla2 IS NOT NULL THEN
      INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                               posiciones, unidades, codigo, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
      VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'ISOTANQUE', 'Zona Isotanques', v_item_id,
              1, 1, v_sigla2, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
              COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
    END IF;

  -- Contenedor 20ft/40ft entero (Almacenaje Full o Vacío): una unidad del
  -- producto "CONTENEDORES" por contenedor, con su sigla como SKU.
  ELSIF NEW.sec1_activa AND NEW.sec1_tipo_contenedor IN ('20ft', '40ft') AND NEW.sec1_almacenaje IN ('full', 'vacio') THEN
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

    IF v_sigla2 IS NOT NULL THEN
      INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                               posiciones, unidades, codigo, tipo_envase, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
      VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'CONTENEDORES', 'Zona Isotanques', v_item_id,
              1, 1, v_sigla2,
              CASE WHEN NEW.sec1_almacenaje = 'full' THEN 'Full' ELSE 'Vacío' END,
              COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
              COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
    END IF;

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

-- Verificación
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'sec2_parcial') THEN
    RAISE EXCEPTION 'Falta la columna reports.sec2_parcial';
  END IF;
  IF position('''full'', ''vacio'')' IN pg_get_functiondef('create_movimiento_from_report()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'create_movimiento_from_report no quedó actualizada';
  END IF;
END $$;

COMMIT;
