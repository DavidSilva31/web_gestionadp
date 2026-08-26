-- Pool de stock compartido entre clientes — permite que un cliente use el
-- inventario de otro (mismo stock físico, facturación 100% separada). Caso
-- real: NAVIERA ULTRANAV CHILE LTDA. y NAVIERA ULTRANAV SPA comparten
-- bodega pero son entidades legales distintas para efectos de HES/tarifas.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS stock_compartido_con UUID REFERENCES clientes(id);

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_stock_compartido_no_self;
ALTER TABLE clientes ADD CONSTRAINT clientes_stock_compartido_no_self
  CHECK (stock_compartido_con IS NULL OR stock_compartido_con != id);

CREATE INDEX IF NOT EXISTS idx_clientes_stock_compartido_con
  ON clientes(stock_compartido_con) WHERE stock_compartido_con IS NOT NULL;
