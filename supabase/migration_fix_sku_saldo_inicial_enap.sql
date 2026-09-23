-- Migración (dato, no esquema): limpia el SKU de los movimientos de saldo
-- inicial de ENAP (marcha blanca), que quedaron guardados como
-- "Saldo Inicial <SKU> <fecha>" en vez de solo el SKU.
-- Afecta 42 filas, todas de ENAP REFINERIAS S.A. (verificado antes de escribir
-- esta migración: no hay ningún otro cliente con el patrón "saldo inicial").
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- Previsualización (no modifica nada) — para revisar el resultado antes del UPDATE:
-- SELECT id, carga, codigo,
--        regexp_replace(codigo, '^\s*Saldo\s+Inicial\s+(.+?)\s+\d{2}-\d{2}\s*$', '\1', 'i') AS codigo_nuevo
-- FROM movimientos
-- WHERE codigo ILIKE '%saldo inicial%';

UPDATE movimientos
SET codigo = regexp_replace(codigo, '^\s*Saldo\s+Inicial\s+(.+?)\s+\d{2}-\d{2}\s*$', '\1', 'i')
WHERE codigo ILIKE '%saldo inicial%';
