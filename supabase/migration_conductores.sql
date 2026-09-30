-- Migración: catálogo de choferes (combobox "Conductor"/"RUT conductor" en
-- Antecedentes de reports). Un chofer siempre tiene el mismo RUT aunque
-- cambie de camión — al elegir uno de los dos campos (nombre o RUT) se
-- autocompleta el otro. Se guarda (upsert por RUT) al enviar a Operaciones,
-- mismo patrón que empresas_transporte.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS conductores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut             TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  -- Última patente con la que vino este chofer — solo referencial, no se
  -- usa para autocompletar Patente (un chofer cambia de camión seguido).
  ultima_patente  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_conductores_nombre ON conductores(nombre);

CREATE OR REPLACE TRIGGER conductores_updated_at
  BEFORE UPDATE ON conductores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE conductores ENABLE ROW LEVEL SECURITY;

-- Abierto a cualquier autenticado (igual que insertar/actualizar un report) —
-- no hay nada sensible acá, solo nombre/RUT/patente de un chofer, y
-- restringir el UPDATE a un rol específico dejaría el upsert fallando en
-- silencio para quien no lo tenga.
CREATE POLICY "Autenticados leen conductores"
  ON conductores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean conductores"
  ON conductores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados actualizan conductores"
  ON conductores FOR UPDATE TO authenticated USING (true);
