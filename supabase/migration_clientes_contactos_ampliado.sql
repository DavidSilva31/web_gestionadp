-- Amplía clientes para soportar hasta 3 contactos (con 2 teléfonos cada uno)
-- — la "BASE DATOS CLIENTES ADP 2026.xlsx" real trae esto para casi todos los
-- clientes y el schema actual solo tenía espacio para 2 contactos parciales.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS contacto_email       TEXT,
  ADD COLUMN IF NOT EXISTS contacto_telefono2   TEXT,
  ADD COLUMN IF NOT EXISTS contacto2_telefono2  TEXT,
  ADD COLUMN IF NOT EXISTS contacto3_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS contacto3_cargo      TEXT,
  ADD COLUMN IF NOT EXISTS contacto3_email      TEXT,
  ADD COLUMN IF NOT EXISTS contacto3_telefono   TEXT;
