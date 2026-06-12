-- ============================================================
-- ADP GESTIÓN — Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Roles de usuario ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('super_admin', 'operador', 'operador_carga');

-- ── Perfiles de usuario ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'operador',
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-crear perfil al registrar usuario en auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer su propio perfil
CREATE POLICY "Usuarios leen su propio perfil"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);


-- ── Secuencia de numeración de reports ───────────────────────
-- En producción, ajustar al último número físico + 1:
--   ALTER SEQUENCE report_number_seq RESTART WITH 54801;
CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

-- ── Tabla principal de reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                INTEGER DEFAULT nextval('report_number_seq') UNIQUE NOT NULL,

  estado                TEXT NOT NULL DEFAULT 'pendiente_despacho'
                          CHECK (estado IN ('borrador', 'pendiente_despacho', 'despachado')),

  -- Antecedentes
  cliente               TEXT NOT NULL,
  fecha                 DATE NOT NULL DEFAULT CURRENT_DATE,
  patente               TEXT NOT NULL,
  conductor             TEXT NOT NULL,
  rut_conductor         TEXT,
  empresa_transporte    TEXT,
  hds_header            BOOLEAN DEFAULT FALSE,

  -- Sección 1: Depósito de Contenedores
  sec1_activa           BOOLEAN DEFAULT FALSE,
  sec1_tipo_movimiento  TEXT CHECK (sec1_tipo_movimiento IN ('ingreso', 'despacho')),
  sec1_tipo_contenedor  TEXT CHECK (sec1_tipo_contenedor IN ('20ft', '40ft', 'isotanque')),
  sec1_carga_normal     BOOLEAN DEFAULT FALSE,
  sec1_carga_imo        BOOLEAN DEFAULT FALSE,
  sec1_clase_imo        TEXT,
  sec1_nu               TEXT,
  sec1_hora_inicio      TIME,
  sec1_hora_termino     TIME,
  sec1_sigla            TEXT,
  sec1_guia_numero      TEXT,
  sec1_interchange      TEXT,
  sec1_hds              BOOLEAN DEFAULT FALSE,

  -- Sección 2: Consolidado / Desconsolidado / Otros
  sec2_activa           BOOLEAN DEFAULT FALSE,
  sec2_consolidado      BOOLEAN DEFAULT FALSE,
  sec2_desconsolidado   BOOLEAN DEFAULT FALSE,
  sec2_picking          BOOLEAN DEFAULT FALSE,
  sec2_paletizado       BOOLEAN DEFAULT FALSE,
  sec2_etiquetado       BOOLEAN DEFAULT FALSE,
  sec2_otro             BOOLEAN DEFAULT FALSE,
  sec2_hora_inicio      TIME,
  sec2_hora_termino     TIME,
  sec2_sigla_numero     TEXT,
  sec2_observaciones    TEXT,

  -- Sección 3: Bodegaje
  sec3_activa           BOOLEAN DEFAULT FALSE,
  sec3_producto         TEXT,
  sec3_clase_imo        TEXT,
  sec3_hora_inicio      TIME,
  sec3_hora_termino     TIME,
  sec3_numero_bodega    TEXT,
  sec3_nu               TEXT,
  sec3_tipo             TEXT CHECK (sec3_tipo IN ('ingreso', 'despacho')),
  sec3_numero_pallets   INTEGER,
  sec3_numero_guia      TEXT,
  sec3_solicitado_por   TEXT CHECK (sec3_solicitado_por IN ('clientes', 'hds', 'operaciones', 'cuyd')),
  sec3_cuyd_detalle     TEXT,
  sec3_observaciones    TEXT,

  -- Firma 1: Operador de carga
  nombre_operador       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id),

  -- Firma 2: Despachador
  nombre_despachador    TEXT,
  fecha_despacho        TIMESTAMPTZ,
  dispatched_by         UUID REFERENCES auth.users(id),

  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_estado   ON reports(estado);
CREATE INDEX IF NOT EXISTS idx_reports_fecha    ON reports(fecha);
CREATE INDEX IF NOT EXISTS idx_reports_patente  ON reports(patente);
CREATE INDEX IF NOT EXISTS idx_reports_cliente  ON reports(cliente);
CREATE INDEX IF NOT EXISTS idx_reports_numero   ON reports(numero);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);

-- ── Auto-actualización de updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS Reports ───────────────────────────────────────────────
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen reports"
  ON reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados crean reports"
  ON reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan reports"
  ON reports FOR UPDATE TO authenticated USING (true);

-- Operador elimina solo sus propios reports; super_admin elimina cualquiera
CREATE POLICY "Eliminar reports"
  ON reports FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );
