-- Migración: permitir varios archivos HDS por report (antes era uno solo).
-- Reemplaza reports.hds_archivo_url (TEXT) por reports.hds_archivos (TEXT[]).
-- Como la columna anterior se agregó recién y ningún report la usa todavía,
-- se reemplaza directo sin backfill.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS hds_archivos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE reports DROP COLUMN IF EXISTS hds_archivo_url;
