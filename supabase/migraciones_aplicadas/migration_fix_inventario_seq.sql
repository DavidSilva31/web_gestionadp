-- Corrige el desface del correlativo de inventario_items.numero: la
-- secuencia quedó desincronizada del máximo real (mismo tipo de bug que
-- movimiento_seq/report_number_seq, encontrado esta vez al crear un producto
-- nuevo desde Bodegaje en un report — "duplicate key value violates unique
-- constraint inventario_items_numero_key").
-- Ejecutar una sola vez en el SQL Editor de Supabase.

SELECT setval('inventario_seq', (SELECT COALESCE(MAX(numero), 0) FROM inventario_items));
