-- Imágenes de referencia (opcionales) de la Sección 3 (Bodegaje) del report — mismo patrón que
-- sec2_evidencia_archivos: array de paths en el bucket de storage "reports-firmados".
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_imagenes_referencia TEXT[] NOT NULL DEFAULT '{}';
