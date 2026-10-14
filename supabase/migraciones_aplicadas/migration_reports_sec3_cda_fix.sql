-- Ajuste a migration_reports_sec3_cda.sql: CUyD y CDA pasan a ser mutuamente
-- excluyentes (uno destilda el otro al clickearlo) y comparten un solo
-- input de detalle — no hace falta una columna sec3_cda_detalle separada.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports DROP COLUMN IF EXISTS sec3_cda_detalle;
