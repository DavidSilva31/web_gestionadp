-- Migración: ciclo de facturación configurable por cliente.
-- Por defecto (1) el HES se calcula por mes calendario, como siempre. Un
-- valor > 1 define un ciclo rodante: "Julio" pasa a ser el período que va
-- del día `dia_corte_facturacion` de junio al día (dia_corte_facturacion - 1)
-- de julio. PROQUIMIN factura así, en ciclos de 26 a 25 — confirmado contra
-- sus HES de referencia.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS dia_corte_facturacion SMALLINT NOT NULL DEFAULT 1;

UPDATE clientes
  SET dia_corte_facturacion = 26
  WHERE id = 'ffa6d81c-f38b-48f2-822a-6d269dc98298'; -- PRODUCTOS QUÍMICOS Y MINERALES LTDA. (PROQUIMIN)
