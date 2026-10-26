-- UTI Chile ubica cada pallet en un RACK (1 al 7, o un contenedor / piso / posición de bodega).
-- Se guarda por movimiento, junto al N° de pallet y la bodega, y se muestra y edita en el Detalle
-- del inventario de ese cliente.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS rack TEXT;
