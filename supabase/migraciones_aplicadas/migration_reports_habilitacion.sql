-- Marca independiente "Habilitación" en el Depósito de Contenedores (Sec 1) del report.
-- No se combina con otras marcas y no afecta el inventario. Ejecutar una sola vez en el SQL Editor de Supabase.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec1_habilitacion BOOLEAN NOT NULL DEFAULT FALSE;
NOTIFY pgrst, 'reload schema';
