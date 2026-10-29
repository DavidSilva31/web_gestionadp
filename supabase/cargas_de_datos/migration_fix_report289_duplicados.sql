-- Limpieza puntual: report 289 (WILHELMSEN) quedó con sus 9 líneas de Bodegaje triplicadas (guardados de las
-- 14:29, 14:50 y 14:54 sin que el borrado previo surtiera efecto, ver migration_report_bodegaje_items_delete_operadores.sql)
-- → 27 filas en report_bodegaje_items y 27 movimientos de despacho en vez de 9, descontando el stock 3 veces.
-- Deja solo la última copia (14:54, cantidades finales), borra los movimientos sobrantes y recalcula el stock
-- de esos 9 productos como ingresos − despachos de sus movimientos.
-- Ejecutar DESPUÉS de migration_report_bodegaje_items_delete_operadores.sql, una sola vez, en el SQL Editor de Supabase.
-- Si algo no cuadra, el bloque falla y se deshace todo.

DO $$
DECLARE
  v_report_id UUID;
  v_items     UUID[];
  v_n         INTEGER;
BEGIN
  SELECT id INTO v_report_id FROM reports WHERE numero = 289;

  SELECT ARRAY_AGG(DISTINCT sec3_inventario_item_id) INTO v_items
    FROM report_bodegaje_items WHERE report_id = v_report_id AND sec3_inventario_item_id IS NOT NULL;

  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;
  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_resync;
  ALTER TABLE movimientos           DISABLE TRIGGER movimientos_sync_inventario;
  ALTER TABLE inventario_items      DISABLE TRIGGER inventario_items_protege_stock;

  -- 1) Movimientos: deja uno por producto, el que coincide con la cantidad final (ej. SOOT REMOVER = 3).
  DELETE FROM movimientos m
   WHERE m.report_id = v_report_id
     AND m.id NOT IN (
       SELECT DISTINCT ON (m2.inventario_item_id) m2.id
         FROM movimientos m2
         JOIN report_bodegaje_items i
           ON i.report_id = m2.report_id
          AND i.sec3_inventario_item_id = m2.inventario_item_id
          AND i.created_at = '2026-10-29T14:54:04.670654+00:00'
          AND COALESCE(i.sec3_numero_unidades, 0) = m2.unidades
        WHERE m2.report_id = v_report_id
        ORDER BY m2.inventario_item_id, m2.numero
     );

  -- 2) Líneas: borra las dos copias anteriores.
  DELETE FROM report_bodegaje_items
   WHERE report_id = v_report_id
     AND created_at IN ('2026-10-29T14:29:21.048377+00:00', '2026-10-29T14:50:35.89983+00:00');

  -- 3) Stock de los productos afectados = ingresos − despachos (nunca bajo 0).
  UPDATE inventario_items it SET
    stock_unidades = GREATEST(0, COALESCE((SELECT SUM(CASE WHEN tipo = 'ingreso' THEN unidades ELSE -unidades END)
                                             FROM movimientos WHERE inventario_item_id = it.id), 0)),
    stock_actual   = GREATEST(0, COALESCE((SELECT SUM(CASE WHEN tipo = 'ingreso' THEN posiciones ELSE -posiciones END)
                                             FROM movimientos WHERE inventario_item_id = it.id), 0))
  WHERE it.id = ANY (v_items);

  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;
  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_resync;
  ALTER TABLE movimientos           ENABLE TRIGGER movimientos_sync_inventario;
  ALTER TABLE inventario_items      ENABLE TRIGGER inventario_items_protege_stock;

  -- Verificación: si no quedaron 9 líneas y 9 movimientos, se deshace todo.
  SELECT COUNT(*) INTO v_n FROM report_bodegaje_items WHERE report_id = v_report_id;
  IF v_n <> 9 THEN RAISE EXCEPTION 'Se esperaban 9 líneas y quedaron %', v_n; END IF;
  SELECT COUNT(*) INTO v_n FROM movimientos WHERE report_id = v_report_id;
  IF v_n <> 9 THEN RAISE EXCEPTION 'Se esperaban 9 movimientos y quedaron %', v_n; END IF;
END $$;

SELECT it.descripcion, it.stock_actual, it.stock_unidades
  FROM inventario_items it
 WHERE it.id IN (SELECT inventario_item_id FROM movimientos WHERE report_id = (SELECT id FROM reports WHERE numero = 289))
 ORDER BY it.descripcion;
