-- Nueva columna "Transporte" en la grilla de Detalle (Kardex) de Inventario
-- — texto libre editable inline, mismo patrón que Bodega.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS transporte TEXT;
