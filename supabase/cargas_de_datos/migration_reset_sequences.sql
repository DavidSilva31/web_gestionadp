-- Reinicia a 1 la numeración visible al usuario (cliente #1, report #1,
-- ítem #1, movimiento #1, cotización COT-YYYY-001, folio HES #1) tras
-- limpiar datos de prueba. Verificar antes que las tablas correspondientes
-- estén vacías — si alguna tiene filas, el primer INSERT tras el reinicio
-- puede chocar con un número ya usado (columnas UNIQUE).
--
--   select count(*) from clientes;
--   select count(*) from reports;
--   select count(*) from inventario_items;
--   select count(*) from movimientos;
--   select count(*) from tarifas_cliente;
--   select count(*) from hes_folios;
--   select count(*) from transporte_incomex;

ALTER SEQUENCE report_number_seq        RESTART WITH 1;
ALTER SEQUENCE cliente_number_seq       RESTART WITH 1;
ALTER SEQUENCE inventario_seq           RESTART WITH 1;
ALTER SEQUENCE movimiento_seq           RESTART WITH 1;
ALTER SEQUENCE cotizacion_seq           RESTART WITH 1;
ALTER SEQUENCE hes_folio_seq            RESTART WITH 1;
ALTER SEQUENCE transporte_incomex_seq   RESTART WITH 1;
