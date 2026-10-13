-- Revisión de índices (comparando los declarados en el repo con las consultas reales
-- de la app). Con el tamaño actual (movimientos 356 filas, reports 67, cotizaciones
-- 1.547, audit_logs 330) Postgres igual usa lecturas completas y no se nota diferencia
-- hoy: esto es para que no se note cuando las tablas crezcan.
--
-- AGREGA (columnas que la app usa para filtrar y que no tenían índice):
--   movimientos.inventario_item_id  -> selectores de producto/lote/peso y Kardex filtran por ítem
--   movimientos.carga               -> el selector de lote/peso también busca por nombre de carga
--   audit_logs (accion, created_at) -> la pantalla de Auditoría filtra por tipo de acción y ordena por fecha;
--                                      es la tabla que más crece (cada acción deja una fila)
--   cotizaciones.fecha              -> filtro por rango de fechas de la lista de Cotizaciones
--   transporte_incomex.fecha        -> la lista filtra y ordena por fecha sin cliente
--                                      (el índice (cliente_id, fecha) solo sirve si se filtra por cliente)
--
-- ELIMINA:
--   idx_mov_cliente -> redundante: idx_mov_cliente_fecha (cliente_id, fecha) ya lo cubre
--                      (un índice compuesto sirve para buscar solo por su primera columna).
--
-- NO TOCA (revisado y correcto):
--   los índices parciales "..._cliente_activo" (WHERE activo = true) de inventario_items,
--   servicios_cliente y tarifas_cliente: son justo los que usa la app (cliente + activo = true).
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Es seguro repetirlo (IF NOT EXISTS / IF EXISTS).

CREATE INDEX IF NOT EXISTS idx_mov_inventario_item   ON movimientos(inventario_item_id);
CREATE INDEX IF NOT EXISTS idx_mov_carga             ON movimientos(carga);
CREATE INDEX IF NOT EXISTS idx_audit_accion_fecha    ON audit_logs(accion, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha    ON cotizaciones(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_transporte_incomex_fecha ON transporte_incomex(fecha DESC);

DROP INDEX IF EXISTS idx_mov_cliente;

-- ── Para revisar en la base real (opcional, solo lectura) ─────────────────────
-- 1) Índices que existen de verdad, su tamaño y cuántas veces se han usado
--    (idx_scan = 0 después de semanas de uso = candidato a eliminar):
--      SELECT relname AS tabla, indexrelname AS indice, idx_scan AS usos,
--             pg_size_pretty(pg_relation_size(indexrelid)) AS tamano
--        FROM pg_stat_user_indexes ORDER BY relname, idx_scan;
-- 2) Tablas que se leen completas con más frecuencia que por índice:
--      SELECT relname AS tabla, seq_scan AS lecturas_completas, idx_scan AS lecturas_por_indice, n_live_tup AS filas
--        FROM pg_stat_user_tables ORDER BY seq_scan DESC;
