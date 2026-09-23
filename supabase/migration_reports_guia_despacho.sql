-- Migración: checkbox "Guía de despacho" en Antecedentes de reports, con
-- adjuntos propios — mismo patrón que hds_header/hds_archivos (ver
-- migration_reports_hds_archivos_multi.sql), solo que para la guía de
-- despacho del cliente en vez de la hoja de datos de seguridad.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS guia_despacho_header    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS guia_despacho_archivos  TEXT[]  NOT NULL DEFAULT '{}';
