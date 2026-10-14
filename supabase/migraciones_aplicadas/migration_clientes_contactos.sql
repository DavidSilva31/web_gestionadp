-- Migración: RUT opcional + datos de contacto ampliados (cargo, teléfono,
-- segundo contacto) para soportar la data real de clientes.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE clientes ALTER COLUMN rut DROP NOT NULL;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_cargo     TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_telefono  TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto2_nombre   TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto2_cargo    TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto2_email    TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto2_telefono TEXT;
