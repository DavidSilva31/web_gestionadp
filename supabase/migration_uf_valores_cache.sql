-- Migración: caché de valores UF por fecha para el módulo HES.
-- La UF de una fecha pasada nunca cambia, así que una vez obtenida
-- de mindicador.cl / api.gael.cloud se guarda acá y no se vuelve a
-- pedir a ninguna API externa para esa misma fecha.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS uf_valores (
  fecha      DATE PRIMARY KEY,
  valor      NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE uf_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access uf_valores" ON uf_valores;
CREATE POLICY "Authenticated full access uf_valores"
  ON uf_valores FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);
