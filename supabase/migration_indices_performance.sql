-- Índices de performance — auditoría de BD (18-08-2026). tarifas_cliente no
-- tenía NINGÚN índice en cliente_id pese a ser consultada en cada carga de
-- HES/servicios (108 filas escaneadas completas por consulta). Se agregan
-- compuestos cliente_id+activo donde el patrón de consulta real siempre
-- filtra por ambos, y se cubren reports/movimientos para las tablas de
-- crecimiento no acotado (auditoría, despacho, KPIs de dashboard).

CREATE INDEX IF NOT EXISTS idx_tarifas_cliente_cliente_activo
  ON tarifas_cliente(cliente_id) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_inventario_cliente_activo
  ON inventario_items(cliente_id) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_servicios_cliente_cliente_activo
  ON servicios_cliente(cliente_id) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_mov_cliente_fecha
  ON movimientos(cliente_id, fecha);

CREATE INDEX IF NOT EXISTS idx_reports_created_at
  ON reports(created_at);

CREATE INDEX IF NOT EXISTS idx_reports_fecha_despacho
  ON reports(fecha_despacho);

-- Duplicado redundante: reports.numero ya es UNIQUE NOT NULL, lo que crea su
-- propio índice único automáticamente. Este índice extra no aporta nada al
-- planner y solo agrega costo de escritura en cada insert/update.
DROP INDEX IF EXISTS idx_reports_numero;
