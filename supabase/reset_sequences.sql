-- ═══════════════════════════════════════════════════
-- RESET SEQUENCES — ADP Gestión · Altos del Puerto
-- Ejecutar en Supabase SQL Editor DESPUÉS de vaciar las
-- tablas de datos de prueba (clientes, reports, movimientos,
-- inventario_items, tarifas_cliente), para que la numeración
-- visible al usuario (cliente #1, report #1, etc.) arranque
-- de nuevo en 1.
-- ═══════════════════════════════════════════════════

ALTER SEQUENCE report_number_seq RESTART WITH 1;
ALTER SEQUENCE cliente_number_seq RESTART WITH 1;
ALTER SEQUENCE inventario_seq RESTART WITH 1;
ALTER SEQUENCE movimiento_seq RESTART WITH 1;
ALTER SEQUENCE cotizacion_seq RESTART WITH 1;
