-- Servicios asociados a un report — se completan del catálogo del cliente
-- (servicios_cliente) o se agregan manualmente. Quedan registrados en el
-- report para que la generación del HES pueda usarlos más adelante.
--
-- servicios_ids: ids de servicios_cliente elegidos del catálogo del cliente.
-- servicios_manual: nombres de servicios agregados a mano (sin catálogo).

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS servicios_ids     UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS servicios_manual  TEXT[] NOT NULL DEFAULT '{}';
