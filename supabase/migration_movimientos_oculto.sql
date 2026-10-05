-- Movimientos ocultos: quedan en la base (ligados a su report, con su efecto
-- de stock) pero no aparecen en el Kardex ni en las sugerencias de lote.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE movimientos SET oculto = TRUE WHERE numero = 722;
