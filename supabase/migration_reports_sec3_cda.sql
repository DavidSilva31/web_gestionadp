-- Migración: nuevo checkbox "CDA" en Antecedentes, junto a "CUyD" — mismo
-- patrón (checkbox propio + input de detalle propio, independiente de
-- "Solicitado por").
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_cda BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_cda_detalle TEXT;
