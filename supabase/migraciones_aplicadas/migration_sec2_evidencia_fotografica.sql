-- Evidencia fotográfica de Consolidado/Desconsolidado (sección 2 del report)
-- — mismo patrón que hds_archivos: array de paths en el bucket de storage
-- "reports-firmados".
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec2_evidencia_archivos TEXT[] NOT NULL DEFAULT '{}';
