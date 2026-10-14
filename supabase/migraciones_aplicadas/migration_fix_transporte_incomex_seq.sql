-- Fix: "duplicate key value violates unique constraint
-- transporte_incomex_numero_key" al crear un report con Transporte ADP.
--
-- transporte_incomex_seq quedó desincronizada del contenido real de la
-- tabla (ej. migration_reset_sequences.sql la reinició a 1 mientras la
-- tabla todavía tenía filas) — nextval() sigue entregando números que ya
-- existen, y el INSERT del trigger sync_transporte_incomex_from_report
-- choca contra el UNIQUE de numero.
--
-- Resincroniza la secuencia al máximo numero real + 1, sin importar cómo
-- quedó desalineada — seguro de correr las veces que haga falta.

SELECT setval(
  'transporte_incomex_seq',
  COALESCE((SELECT MAX(numero) FROM transporte_incomex), 0) + 1,
  false
);
