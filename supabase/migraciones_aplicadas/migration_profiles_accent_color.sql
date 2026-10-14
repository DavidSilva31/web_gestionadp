-- Migración: color de acento personalizable (tema claro) por usuario.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT 'celeste';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_accent_color_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_accent_color_check
  CHECK (accent_color IN ('celeste', 'verde', 'indigo', 'morado', 'rosa', 'naranja', 'teal'));
