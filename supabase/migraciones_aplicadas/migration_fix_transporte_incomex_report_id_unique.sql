-- Fix: el índice único parcial (WHERE report_id IS NOT NULL) no calza como
-- "arbiter" del ON CONFLICT (report_id) del trigger
-- (sync_transporte_incomex_from_report) — Postgres tira
-- "no unique or exclusion constraint matching the specification".
-- Un UNIQUE normal sobre una columna nullable ya permite múltiples NULL sin
-- problema (NULL nunca choca con NULL), así que el índice parcial no hacía
-- falta.

DROP INDEX IF EXISTS idx_transporte_incomex_report_id;
CREATE UNIQUE INDEX idx_transporte_incomex_report_id ON transporte_incomex(report_id);
