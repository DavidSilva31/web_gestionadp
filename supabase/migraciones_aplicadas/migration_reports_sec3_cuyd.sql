-- Migración: CUyD como checkbox propio en Antecedentes, independiente de
-- "Solicitado por" (que sigue siendo Clientes/Operaciones únicamente).
-- sec3_cuyd_detalle ya existía; le faltaba el booleano que lo activa.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_cuyd BOOLEAN NOT NULL DEFAULT FALSE;
