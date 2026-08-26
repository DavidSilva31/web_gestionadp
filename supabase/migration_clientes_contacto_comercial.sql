-- Contacto comercial (quien recibe el HES), separado de los contactos
-- operacionales — antes no existía este campo y emails[]/contacto
-- terminaban mezclando ambos roles. Ejecutar una sola vez en Supabase.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_comercial_nombre TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_comercial_cargo TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto_comercial_telefono TEXT;
