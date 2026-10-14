-- Corrige el residuo de stock que dejó la limpieza del report #80
-- (migration_fix_report80_duplicados.sql): rebuild_bodegaje_movimientos()
-- revierte el stock de los movimientos que existían (en ese momento, los 8
-- duplicados) y lo reaplica desde los ítems ya limpios (4) — como lo que
-- revirtió estaba duplicado, quedó un residuo igual al total despachado.
--
-- Verificado: la suma real de movimientos de ambos ítems da exactamente 0/0
-- (todo lo ingresado fue luego despachado por completo) — no es un ajuste a
-- ciegas, es la cifra que matemáticamente corresponde.
--   MAGISTER20 (113436): stock_actual 18→0, stock_unidades 648→0
--   MAGISTER20 (101067): stock_actual 2→0,  stock_unidades 120→0
--
-- Requiere desactivar momentáneamente el guardrail de edición directa de
-- stock (guard_inventario_items_stock_directo) porque esta corrección es,
-- justamente, un UPDATE directo fuera del flujo de movimientos.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE inventario_items DISABLE TRIGGER inventario_items_protege_stock;

UPDATE inventario_items SET stock_actual = 0, stock_unidades = 0
  WHERE id = 'cba966b4-6772-4080-86ed-a59cc00af322'; -- MAGISTER20 (113436)

UPDATE inventario_items SET stock_actual = 0, stock_unidades = 0
  WHERE id = '8239255b-5bf0-4495-99af-f8e1575f79de'; -- MAGISTER20 (101067)

ALTER TABLE inventario_items ENABLE TRIGGER inventario_items_protege_stock;
