-- Reinicia los contadores de numero para reports y hes_folios.
-- Verifica antes con:
--   select count(*) from reports;
--   select count(*) from hes_folios;
-- Si alguna tiene filas, el primer INSERT tras el reinicio podria chocar con
-- un numero ya usado (UNIQUE).

ALTER SEQUENCE report_number_seq RESTART WITH 1;
ALTER SEQUENCE hes_folio_seq RESTART WITH 1;
