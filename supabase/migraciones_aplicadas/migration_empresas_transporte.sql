-- Migración: catálogo de empresas de transporte externo (combobox "Empresa
-- de transporte" en Antecedentes de reports, cuando el transporte es
-- "Transporte Cliente"). Reemplaza la lista fija que vivía en el código —
-- cualquier empresa nueva que se escriba en el formulario queda guardada acá
-- y aparece como sugerencia en los próximos reports.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS empresas_transporte (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id)
);

ALTER TABLE empresas_transporte ENABLE ROW LEVEL SECURITY;

-- Cualquier autenticado ve el catálogo y puede agregar una empresa nueva
-- (mismo rol que ya puede crear reports) — pero solo operador+ puede
-- desactivarla, para no borrar por error una empresa en uso desde el combobox.
CREATE POLICY "Autenticados leen empresas_transporte"
  ON empresas_transporte FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados agregan empresas_transporte"
  ON empresas_transporte FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Operadores desactivan empresas_transporte"
  ON empresas_transporte FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

-- Semilla con las empresas ya en uso (mismas que estaban fijas en el código).
INSERT INTO empresas_transporte (nombre) VALUES
  ('TRANSPORTE LM'),
  ('TRANSPORTE JP'),
  ('TRANSPORTE PIZARRO'),
  ('TRANSPORTE CARMAR')
ON CONFLICT (nombre) DO NOTHING;
