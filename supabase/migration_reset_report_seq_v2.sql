-- Limpieza de reports de prueba (verificación de "Guía de despacho" y
-- "empresas_transporte" en esta sesión) — solo queda el report #1 real,
-- reinicia el correlativo de N° Report en 2.
ALTER SEQUENCE report_number_seq RESTART WITH 2;
