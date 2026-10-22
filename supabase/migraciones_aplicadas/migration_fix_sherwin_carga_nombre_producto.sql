-- Sherwin Williams: los ingresos de los 137 productos se guardaron con el nombre sin sufijo
-- (ej. "PINTURA (1009)") y después los productos pasaron a llamarse "PINTURA (1009) (TINETA)" /
-- "(CAJA)". Los despachos de reports usan el nombre actual, así que el Detalle del inventario
-- los mostraba como dos productos distintos (el despacho con saldo negativo).
-- Se alinea el texto `carga` de los movimientos con el nombre actual de su producto.
--
-- El trigger de stock (movimientos_sync_inventario) se desactiva un instante: en un UPDATE
-- revierte y vuelve a aplicar cada movimiento con GREATEST(0, ...), lo que dejaría el stock
-- MÁS ALTO en los productos ya despachados parcialmente. Cambiar solo el texto no debe tocar stock.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos DISABLE TRIGGER movimientos_sync_inventario;

UPDATE movimientos m
   SET carga = i.descripcion
  FROM inventario_items i
 WHERE m.inventario_item_id = i.id
   AND i.cliente_id = (SELECT id FROM clientes WHERE nombre ILIKE 'SHERWIN WILLIAMS%' ORDER BY nombre LIMIT 1)
   AND m.carga IS DISTINCT FROM i.descripcion;

ALTER TABLE movimientos ENABLE TRIGGER movimientos_sync_inventario;
