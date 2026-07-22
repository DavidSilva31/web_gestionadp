-- Migración: agrega preferencia de notificaciones por usuario.
-- Cuando es false, la campanita del topbar no muestra ni obtiene
-- notificaciones para ese usuario (se sigue registrando todo en
-- audit_logs / Auditoría de todas formas).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notificaciones_activas BOOLEAN NOT NULL DEFAULT TRUE;
