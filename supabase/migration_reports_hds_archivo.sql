-- Migración: adjuntar un archivo (HDS — Hoja de Datos de Seguridad) al report
-- cuando se marca el checkbox "HDS (Hoja de datos de seguridad presente)".
-- Reutiliza el bucket de storage "reports-firmados" (mismo usado para el
-- documento firmado de despacho), con un prefijo "hds-" para no chocar nombres.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- NOTA: superada por migration_reports_hds_archivos_multi.sql (permite varios
-- archivos por report en vez de uno solo). Se deja como registro histórico.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS hds_archivo_url TEXT;
