-- Detalle (Kardex) agrupa movimientos por su columna `carga` — pero
-- create_movimiento_from_report() copiaba ahí el nombre COMPLETO del ítem
-- (inventario_items.descripcion incluye el envase entre paréntesis, ej.
-- "BENCINA (TAMBOR)"). Si ese nombre cambiaba (un rename) o el mismo
-- producto se cargó alguna vez con un envase distinto en el texto, el
-- mismo producto terminaba partido en dos grupos en Detalle — como pasó con
-- "BENCINA" / "BENCINA BLANCA (TAMBOR)".
--
-- De ahora en más movimientos.carga guarda solo el nombre del producto, sin
-- el envase. El envase real de cada movimiento ya vive aparte en
-- movimientos.tipo_envase — no se pierde información, solo se saca del
-- texto usado para agrupar.

CREATE OR REPLACE FUNCTION strip_envase_suffix(nombre TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN nombre ~* '\s*\((Tambor|Bid[oó]n|IBC|IBC METAL|Saco|Sacos|Caja|Cajas|Pallet|Granel|Maxisaco|Tineta|Cilindro|Cu[ñn]ete|Otro|Mezcla)\)\s*$'
      THEN TRIM(regexp_replace(nombre, '\s*\([^)]*\)\s*$', ''))
    ELSE nombre
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION create_movimiento_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
  v_item     RECORD;
  v_has_items BOOLEAN := FALSE;
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    v_tipo     := COALESCE(NEW.sec3_tipo, 'ingreso');
    v_servicio := 'Almacenaje';

    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = NEW.id ORDER BY orden LOOP
      v_has_items := TRUE;
      INSERT INTO movimientos (
        tipo, servicio, cliente_id, cliente_nombre, carga, area,
        posiciones, unidades, lote, cas, guia_numero, orden_compra,
        fecha_elaboracion, fecha_vencimiento,
        operador, estado, fecha, report_id, created_by, tarifa_cliente_id
      ) VALUES (
        v_tipo, v_servicio, v_cliente_id, NEW.cliente,
        strip_envase_suffix(COALESCE(v_item.sec3_producto, 'Bodegaje')), NULL,
        v_item.sec3_numero_pallets,
        v_item.sec3_numero_unidades,
        v_item.sec3_lote,
        v_item.sec3_cas,
        NEW.sec3_numero_guia,
        v_item.sec3_orden_compra,
        v_item.sec3_fecha_elaboracion,
        v_item.sec3_fecha_vencimiento,
        COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
        'completado',
        COALESCE(NEW.fecha_despacho, NOW()),
        NEW.id,
        NEW.dispatched_by,
        v_item.tarifa_cliente_id
      );
    END LOOP;

    -- Defensivo: sec3_activa=true pero sin ítems (no debería pasar tras el
    -- backfill + UI nueva) — no perder el movimiento silenciosamente.
    IF NOT v_has_items THEN
      INSERT INTO movimientos (
        tipo, servicio, cliente_id, cliente_nombre, carga, area,
        operador, estado, fecha, report_id, created_by, tarifa_cliente_id
      ) VALUES (
        v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'Bodegaje', NULL,
        COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
        COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id
      );
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
$$ LANGUAGE plpgsql SET search_path = public;

-- ── Backfill: normaliza el historial ya cargado ──────────────────────────
-- Solo toca filas cuyo `carga` realmente tiene un envase pegado al final
-- (strip_envase_suffix las deja igual si no matchea el patrón) — no afecta
-- el resto (Consolidado, Desconsolidado, Contenedor 20' — IMO 3, etc.).
UPDATE movimientos SET carga = strip_envase_suffix(carga)
WHERE carga IS DISTINCT FROM strip_envase_suffix(carga);
