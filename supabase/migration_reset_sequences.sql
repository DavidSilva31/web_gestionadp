-- Migración: resetea numeración a 1 tras limpiar datos de prueba.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER SEQUENCE report_number_seq  RESTART WITH 1;
ALTER SEQUENCE cliente_number_seq RESTART WITH 1;
ALTER SEQUENCE inventario_seq     RESTART WITH 1;
ALTER SEQUENCE movimiento_seq     RESTART WITH 1;
ALTER SEQUENCE cotizacion_seq     RESTART WITH 1;
