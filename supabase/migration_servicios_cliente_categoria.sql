-- Separa el catálogo de servicios_cliente por tipo: "transporte" debe
-- verse/buscarse desde el módulo Transporte Incomex, el resto ("otro")
-- desde Servicios Adicionales — antes todo vivía junto en un solo catálogo
-- sin distinción, obligando a revisar todo a mano en cualquiera de los dos
-- módulos.

ALTER TABLE servicios_cliente
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'otro'
  CHECK (categoria IN ('transporte', 'otro'));
