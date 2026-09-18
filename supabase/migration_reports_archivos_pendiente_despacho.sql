-- Archivos adjuntos mientras el report está en pendiente_despacho — para
-- subir el report escaneado, una guía, u otro archivo necesario antes de
-- despachar. Distinto de documento_firmado_url (el documento de despacho
-- firmado, se sube recién al confirmar la salida) y de hds_archivos (los
-- HDS de Antecedentes, solo editables en borrador/pendiente_operaciones).

ALTER TABLE reports ADD COLUMN IF NOT EXISTS archivos_pendiente_despacho TEXT[] NOT NULL DEFAULT '{}';
