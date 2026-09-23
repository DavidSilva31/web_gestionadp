-- Limpieza: report #3 (RENO CHILE, pendiente_operaciones) era de prueba —
-- sin productos de Bodegaje, movimientos ni transporte ligados, se borra
-- limpio. Solo quedan los reports #1 y #2 (ENAP, ambos despachados, reales).
-- Reinicia el correlativo en 2, para que el próximo report creado sea el #3.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DELETE FROM reports WHERE numero = 3;

ALTER SEQUENCE report_number_seq RESTART WITH 3;
