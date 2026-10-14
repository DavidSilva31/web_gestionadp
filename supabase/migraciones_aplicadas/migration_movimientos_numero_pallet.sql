-- Migración: número de pallet por movimiento (columna "Nr. Pallet" del Kardex,
-- distinta de "posiciones" que cuenta cantidad de pallets/bultos movidos).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS numero_pallet TEXT;
