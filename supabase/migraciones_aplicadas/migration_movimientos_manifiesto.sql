-- Migración: datos de lote/envase del manifiesto en cada movimiento
-- (código, IMO, UN, CAS, lote, fechas de elaboración/vencimiento, envase).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS imo TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS un TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS cas TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS lote TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS fecha_elaboracion DATE;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS peso_envase NUMERIC;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS tipo_envase TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS posiciones INTEGER;

ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_tipo_envase_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_envase_check
  CHECK (tipo_envase IS NULL OR tipo_envase IN ('Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Otro'));
