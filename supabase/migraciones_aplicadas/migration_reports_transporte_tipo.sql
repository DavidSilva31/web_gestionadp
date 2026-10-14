-- Migración: reemplaza el campo libre "Empresa de transporte" por un selector
-- Propio / Externo. Si es "propio", el report pasa a aparecer en el nuevo
-- módulo "Transporte". empresa_transporte se mantiene para el nombre de la
-- empresa cuando el transporte es externo (queda NULL si es propio).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS transporte_tipo TEXT NOT NULL DEFAULT 'externo'
  CHECK (transporte_tipo IN ('propio', 'externo'));
