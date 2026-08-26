-- Reinicia los contadores de reports y HES a 1. Ejecutar solo después de
-- confirmar que reports y hes_folios están vacíos (ya se limpiaron
-- hes_folios de prueba y reports ya estaba en 0 filas).
ALTER SEQUENCE report_number_seq RESTART WITH 1;
ALTER SEQUENCE hes_folio_seq RESTART WITH 1;
