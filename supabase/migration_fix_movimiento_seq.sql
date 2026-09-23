-- Fix: movimiento_seq quedó desincronizada del máximo `numero` ya usado en
-- movimientos (probablemente datos de prueba insertados con numero
-- explícito, sin avanzar la secuencia) — cualquier despacho nuevo puede
-- fallar con "duplicate key value violates unique constraint
-- movimientos_numero_key" en cuanto nextval() alcance un valor ya tomado.
-- No relacionado con report_bodegaje_items — bug preexistente que salió a
-- la luz al probar el despacho multi-producto. Ejecutar una sola vez.
SELECT setval('movimiento_seq', (SELECT COALESCE(MAX(numero), 0) FROM movimientos));
