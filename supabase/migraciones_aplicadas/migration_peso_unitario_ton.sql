-- Peso por unidad (ton) — permite recalcular peso_ton automáticamente cada
-- vez que stock_actual cambia por un movimiento o despacho de report, sin
-- tener que volver a pesar/ingresar el dato a mano.
--
-- peso_unitario_ton = peso_ton actual / stock_actual actual, calculado una
-- vez al crear/corregir el ítem. De ahí en adelante:
--   peso_ton = peso_unitario_ton * stock_actual
-- se recalcula en el cliente (movimientos, reports) cada vez que stock_actual
-- cambia.

ALTER TABLE inventario_items
  ADD COLUMN IF NOT EXISTS peso_unitario_ton NUMERIC(14, 6);

UPDATE inventario_items
SET peso_unitario_ton = peso_ton / stock_actual
WHERE peso_ton IS NOT NULL
  AND stock_actual > 0
  AND peso_unitario_ton IS NULL;
