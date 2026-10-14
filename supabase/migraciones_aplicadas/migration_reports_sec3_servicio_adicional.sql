-- Migración: check explícito "Servicio Adicional" en Sección 3 (Bodegaje).
-- Reemplaza la heurística anterior del módulo Servicios Adicionales (que
-- inferra el servicio a partir de que sec2_observaciones/sec3_observaciones
-- tuvieran texto) por un flag booleano que Operaciones marca directamente.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_servicio_adicional BOOLEAN NOT NULL DEFAULT FALSE;
