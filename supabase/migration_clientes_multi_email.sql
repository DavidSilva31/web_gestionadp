-- Migración: permite que un cliente tenga más de un correo asociado.
-- Reemplaza la columna clientes.email (TEXT) por clientes.emails (TEXT[]).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS emails TEXT[] NOT NULL DEFAULT '{}';

-- Migra el correo existente (si había) al nuevo arreglo.
UPDATE clientes
SET emails = ARRAY[email]
WHERE email IS NOT NULL AND email <> '' AND emails = '{}';

ALTER TABLE clientes DROP COLUMN IF EXISTS email;
