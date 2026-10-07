-- Clientes propios del módulo de Cotizaciones (no forman parte de `clientes`).
-- Las cotizaciones migradas del portal conservan su ID original (id_portal) y su
-- número original. Los 83 clientes del portal que ya existen en `clientes` quedan
-- vinculados (cliente_id), sin duplicar el módulo de clientes.

-- ── 1) Tabla de clientes de cotización ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clientes_cotizacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_portal   INTEGER UNIQUE,
  nombre      TEXT NOT NULL,
  rut         TEXT,
  direccion   TEXT,
  ciudad      TEXT,
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_cotizacion_nombre ON clientes_cotizacion(UPPER(nombre));

ALTER TABLE clientes_cotizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo super_admin" ON clientes_cotizacion;
CREATE POLICY "solo super_admin" ON clientes_cotizacion FOR ALL TO authenticated
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- ── 2) Cotizaciones: ID del portal, número del portal, cliente del nuevo módulo ─

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS id_portal INTEGER UNIQUE;

-- Las 5 cotizaciones de prueba se borran: no tienen id_portal y se reemplazan por la migración.
DELETE FROM cotizaciones WHERE id_portal IS NULL;

-- El número del portal se conserva; hay números repetidos en el portal, así que no puede ser único.
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_numero_key;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_numero ON cotizaciones(numero);

-- Nuevas cotizaciones seguirán desde el número más alto.
SELECT setval('cotizacion_numero_seq', GREATEST((SELECT COALESCE(MAX(numero), 0) FROM cotizaciones), 1));

ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_cliente_id_fkey;
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes_cotizacion(id) ON DELETE RESTRICT;
