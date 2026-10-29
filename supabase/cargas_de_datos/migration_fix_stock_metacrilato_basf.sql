-- BASF CHILE S.A. · METACRILATO (ALM-208): el stock del ítem quedó en 28 pos / 108 und,
-- pero los movimientos suman 51 pos / 200 und (lote 3703W71264745J: 19, lote XF20260708: 32).
-- Alinea el stock del ítem con sus movimientos (ingresos − despachos).
DO $$
BEGIN
  ALTER TABLE inventario_items DISABLE TRIGGER inventario_items_protege_stock;

  UPDATE inventario_items it SET
    stock_actual   = GREATEST(0, COALESCE((SELECT SUM(CASE WHEN m.tipo = 'ingreso' THEN m.posiciones ELSE -m.posiciones END)
                                           FROM movimientos m WHERE m.inventario_item_id = it.id), 0)),
    stock_unidades = GREATEST(0, COALESCE((SELECT SUM(CASE WHEN m.tipo = 'ingreso' THEN m.unidades ELSE -m.unidades END)
                                           FROM movimientos m WHERE m.inventario_item_id = it.id), 0))
  WHERE it.id = 'e65de7ad-37d0-4274-a51f-2a7faa1857e0';

  ALTER TABLE inventario_items ENABLE TRIGGER inventario_items_protege_stock;
END $$;

SELECT descripcion, stock_actual, stock_unidades FROM inventario_items
WHERE id = 'e65de7ad-37d0-4274-a51f-2a7faa1857e0';  -- esperado: 51 / 200
