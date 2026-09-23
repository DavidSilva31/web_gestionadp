-- Limpieza de datos de prueba antes de la marcha blanca con ENAP.
-- Estado verificado antes de escribir este script: solo existen 2 reports
-- (#1 ENAP, despachado 21-09 — el que se mantiene; #5 RENO CHILE, prueba del
-- 23-09 — se borra) y 19 audit_logs (3 del 21-09, 16 del 23-09).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- 1) Reports: deja solo el #1.
--    Cascada automática al borrar el #5: sus report_bodegaje_items se borran
--    (ON DELETE CASCADE) y el stock que movió se revierte solo (trigger
--    sync_bodegaje_stock_on_reports_delete). Los movimientos que generó su
--    despacho quedan con report_id = NULL (ON DELETE SET NULL), no se borran
--    solos — por eso el paso 2.
DELETE FROM reports WHERE numero = 5;

-- 2) Movimientos huérfanos que dejó el despacho del report #5 (mov#645 y
--    #646, LUPRANATE). Seguro de borrar: no tienen inventario_item_id
--    (movían stock vía report_bodegaje_items, no vía este movimiento), así
--    que no vuelven a tocar el stock al eliminarlos.
DELETE FROM movimientos WHERE numero IN (645, 646);

-- 3) Auditoría: deja solo las entradas del 21-09 (día del report #1); borra
--    todo lo del 23-09 (incluye el rastro de los reports de prueba #2/#3/#4/#5).
DELETE FROM audit_logs WHERE created_at::date <> DATE '2026-09-21';

-- 4) Reinicia el correlativo de N° Report en 2, para que el próximo report
--    que se cree sea el #2 (y no salte al #6 por los números ya usados y
--    borrados hoy).
ALTER SEQUENCE report_number_seq RESTART WITH 2;
