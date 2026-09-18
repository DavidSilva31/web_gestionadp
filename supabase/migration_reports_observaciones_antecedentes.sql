-- Nuevo campo "Observaciones" en Antecedentes del report — distinto de
-- sec2_observaciones/sec3_observaciones (que son de cada sección), este es
-- a nivel de report completo, lo llena Recepción.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS observaciones TEXT;
