-- Migración: folio correlativo por cada HES generado + registro de emisión.
-- Antes cada HES se calculaba al vuelo sin dejar rastro — dos generaciones
-- del mismo cliente/mes eran documentos idénticos sin nada que los distinga.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE SEQUENCE IF NOT EXISTS hes_folio_seq START 1;

CREATE TABLE IF NOT EXISTS hes_folios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               INTEGER NOT NULL DEFAULT nextval('hes_folio_seq') UNIQUE,
  cliente_id           UUID NOT NULL REFERENCES clientes(id),
  tarifa_ids           UUID[] NOT NULL,
  mes                  SMALLINT NOT NULL,
  anio                 SMALLINT NOT NULL,
  periodo_start        DATE NOT NULL,
  periodo_end          DATE NOT NULL,
  total_uf             NUMERIC(14,4),
  total_clp            NUMERIC(14,2),
  generado_por         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generado_por_nombre  TEXT,
  generado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_a            TEXT[],
  enviado_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hes_folios_cliente ON hes_folios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_hes_folios_generado_at ON hes_folios(generado_at DESC);

ALTER TABLE hes_folios ENABLE ROW LEVEL SECURITY;

-- Mismos roles que ya pueden entrar a /hes (operador y super_admin).
CREATE POLICY "Operadores leen hes_folios"
  ON hes_folios FOR SELECT TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operadores crean hes_folios"
  ON hes_folios FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operadores actualizan hes_folios"
  ON hes_folios FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));
