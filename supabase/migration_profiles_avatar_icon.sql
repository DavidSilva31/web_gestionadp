-- Migración: permite elegir un ícono como avatar en Mi Perfil
-- (en vez de solo las iniciales). NULL = sigue mostrando iniciales.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_icon TEXT;
