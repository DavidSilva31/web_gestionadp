-- Corrección puntual: el report #103 (GABRIEL DE LUCAS ZAMORANO) se registró por
-- error con Consolidado/Desconsolidado (Sección 2) y Bodegaje (Sección 3); debe
-- quedar solo como despacho del contenedor MRSU124579-2 (Sección 1). El
-- desconsolidado y el bodegaje se registran en un report nuevo.
--
-- Qué hace:
--   1) Borra el movimiento de despacho de CARBURO DE CALCIO (#1451). El stock de
--      ese ítem ya es 0 (el despacho se había "topado" en 0 por no existir un
--      ingreso previo), así que se borra SIN revertir stock — revertirlo lo
--      dejaría en 23/225 de mercadería que nunca existió en el sistema.
--   2) Borra la línea de Bodegaje del report.
--   3) Deja el report sin Sección 2 ni Sección 3 (incluye servicio adicional y
--      observaciones de esas secciones) y marca Almacenaje Vacío en la Sección 1.
--      Se conservan Antecedentes (guía, tipo de movimiento = despacho, etc.) y las
--      fotos de evidencia del desconsolidado (quedan en el report por si hay que
--      reutilizarlas en el nuevo).
--   4) Registra el despacho del contenedor como producto CONTENEDORES del cliente
--      (1 unidad, envase Vacío, sigla como SKU). El contenedor nunca se ingresó
--      en el sistema, así que su stock queda en 0, igual que el producto.
--   El ítem CARBURO DE CALCIO (SKU 50-80) se mantiene en el catálogo del cliente
--   para poder elegirlo en el report nuevo.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DO $$
DECLARE
  v_rep     UUID;
  v_sigla   TEXT;
  v_cliente TEXT;
  v_cli     UUID;
  v_cont    UUID;
  v_fecha   TIMESTAMPTZ;
  v_op      TEXT;
  v_by      UUID;
BEGIN
  SELECT id, NULLIF(btrim(sec1_sigla), ''), cliente, fecha_despacho,
         COALESCE(nombre_despachador, nombre_operador), dispatched_by
    INTO v_rep, v_sigla, v_cliente, v_fecha, v_op, v_by
    FROM reports WHERE numero = 103;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'No existe el report 103'; END IF;
  SELECT id INTO v_cli FROM clientes WHERE nombre = v_cliente LIMIT 1;

  -- 1) movimiento del producto, sin tocar stock
  PERFORM set_config('adp.skip_mov_stock_sync', '1', true);
  DELETE FROM movimientos WHERE report_id = v_rep;
  PERFORM set_config('adp.skip_mov_stock_sync', '0', true);

  -- 2) línea de Bodegaje (el candado de report despachado se levanta un instante)
  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;
  DELETE FROM report_bodegaje_items WHERE report_id = v_rep;
  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;

  -- 3) report sin Sección 2 ni 3, con Almacenaje Vacío en la Sección 1
  UPDATE reports SET
    sec2_activa = false, sec2_consolidado = false, sec2_desconsolidado = false, sec2_picking = false,
    sec2_paletizado = false, sec2_etiquetado = false, sec2_otro = false,
    sec2_sigla_numero = NULL, sec2_observaciones = NULL,
    sec3_activa = false, sec3_hora_inicio = NULL, sec3_hora_termino = NULL,
    sec3_observaciones = NULL, sec3_servicio_adicional = false,
    servicios_ids = '{}', servicios_manual = '{}',
    sec1_almacenaje = 'vacio'
  WHERE id = v_rep;

  -- 4) despacho del contenedor
  IF v_sigla IS NOT NULL AND v_cli IS NOT NULL THEN
    SELECT id INTO v_cont FROM inventario_items
     WHERE cliente_id = v_cli AND descripcion = 'CONTENEDORES' AND categoria = 'Contenedor IMO' LIMIT 1;
    IF v_cont IS NULL THEN
      INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, unidad, stock_actual, stock_unidades, activo)
      VALUES (v_cli, 'CONTENEDORES', 'Contenedor IMO', 'Zona Isotanques', 'unidad', 0, 0, true)
      RETURNING id INTO v_cont;
    END IF;

    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, inventario_item_id,
                             posiciones, unidades, codigo, tipo_envase, operador, estado, fecha, report_id, created_by)
    VALUES ('despacho', 'Almacenaje', v_cli, v_cliente, 'CONTENEDORES', 'Zona Isotanques', v_cont,
            1, 1, v_sigla, 'Vacío', v_op, 'completado', COALESCE(v_fecha, NOW()), v_rep, v_by);
  END IF;
END $$;
