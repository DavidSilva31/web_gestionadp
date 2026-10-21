-- Módulo "Tarifado Transporte": tarifas escalonadas según tramo de valor del diésel,
-- en UF por viaje (hoja AJUSTADA de docs/TARIFADO ESCALONADO.xlsx). Mismo esquema que
-- Cotizaciones: acceso solo super_admin, clientes de clientes_cotizacion y
-- observaciones del catálogo de Cotizaciones.
-- Los 7 valores de cada tarifa siguen el orden de TRAMOS_DIESEL (src/lib/tarifado-transporte-pdf-build.ts):
-- 1001-1100 ... 1601-1700 (CLP).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS tarifado_catalogo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trayecto    TEXT NOT NULL,
  capacidad   TEXT NOT NULL,
  uf_pre_alza NUMERIC(10,4),
  valores_uf  NUMERIC(12,4)[] NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- El primer tarifado nuevo toma el N° 84 (el 83_2026 es el del Excel de OXICORP).
CREATE SEQUENCE IF NOT EXISTS tarifado_numero_seq START 84;

CREATE TABLE IF NOT EXISTS tarifados (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              INTEGER NOT NULL DEFAULT nextval('tarifado_numero_seq'),
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_desde      DATE,
  emisor              TEXT NOT NULL CHECK (emisor IN ('Altos del Puerto', 'Incomex', 'Mar Azul')),
  cliente_id          UUID NOT NULL REFERENCES clientes_cotizacion(id) ON DELETE RESTRICT,
  atencion            TEXT,
  ciudad              TEXT,
  direccion           TEXT,
  observaciones_extra TEXT,
  created_by          UUID REFERENCES auth.users(id),
  updated_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Copia de las tarifas elegidas (los valores pueden ajustarse en cada tarifado sin tocar el catálogo).
CREATE TABLE IF NOT EXISTS tarifado_lineas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifado_id UUID NOT NULL REFERENCES tarifados(id) ON DELETE CASCADE,
  trayecto    TEXT NOT NULL,
  capacidad   TEXT NOT NULL DEFAULT '',
  uf_pre_alza NUMERIC(10,4),
  valores_uf  NUMERIC(12,4)[] NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tarifado_observaciones (
  tarifado_id    UUID NOT NULL REFERENCES tarifados(id) ON DELETE CASCADE,
  observacion_id UUID NOT NULL REFERENCES observaciones_cotizacion(id) ON DELETE RESTRICT,
  PRIMARY KEY (tarifado_id, observacion_id)
);

CREATE INDEX IF NOT EXISTS idx_tarifados_cliente ON tarifados(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarifado_lineas_tar ON tarifado_lineas(tarifado_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tarifado_catalogo','tarifados','tarifado_lineas','tarifado_observaciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "solo super_admin" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "solo super_admin" ON %I FOR ALL TO authenticated
         USING (current_user_role() = ''super_admin'')
         WITH CHECK (current_user_role() = ''super_admin'')', t);
  END LOOP;
END $$;

-- Catálogo inicial (hoja AJUSTADA; la fila duplicada de PORTEO VAP se cargó una sola vez).
INSERT INTO tarifado_catalogo (trayecto, capacidad, uf_pre_alza, valores_uf, orden) VALUES
  ('PORTEO VAP-ALTOS DEL PUERTO (Incluye devolución contenedor vacío en VAP)', '27 ton', 11.73, ARRAY[11.0411, 11.2074, 11.3737, 11.5401, 11.7064, 11.8727, 12.039]::NUMERIC[], 0),
  ('PORTEO SAI-ALTOS DEL PUERTO', '27 ton', 12.71, ARRAY[18.937, 19.3321, 19.7271, 20.1221, 20.5171, 20.9121, 21.3072]::NUMERIC[], 1),
  ('DEVOLUCION UNIDAD VACIA EN SAI', '27 ton', 6.6, ARRAY[18.937, 19.3321, 19.7271, 20.1221, 20.5171, 20.9121, 21.3072]::NUMERIC[], 2),
  ('DESPACHO ADP-SANTIAGO', '27 ton', 13.8, ARRAY[14.4328, 14.8546, 15.2764, 15.6983, 16.1201, 16.5419, 16.9638]::NUMERIC[], 3),
  ('DESPACHO SANTIAGO-ANTOFAGASTA (IDA) M.ZALDIVAR', '27 ton', 85, ARRAY[89.4293, 92.3822, 95.335, 98.2879, 101.2407, 104.1936, 107.1465]::NUMERIC[], 4),
  ('DESPACHO SANTIAGO-ANTOFAGASTA (IDA Y RETORNO) M.ZALDIVAR', '27 ton', 99.5, ARRAY[103.9293, 106.8822, 109.835, 112.7879, 115.7407, 118.6936, 121.6465]::NUMERIC[], 5),
  ('DESPACHO SANTIAGO-ANTOFAGASTA (IDA) M.CENTINELA', '27 ton', 90, ARRAY[94.4293, 97.3822, 100.335, 103.2879, 106.2407, 109.1936, 112.1465]::NUMERIC[], 6),
  ('DESPACHO SANTIAGO-ANTOFAGASTA (IDA Y RETORNO) M.CENTINELA', '27 ton', 104.5, ARRAY[108.9293, 111.8822, 114.835, 117.7879, 120.7407, 123.6936, 126.6465]::NUMERIC[], 7),
  ('DESPACHO ADP-COPIAPO (IDA)', '27 ton', 47.5, ARRAY[49.9393, 51.5655, 53.1916, 54.8178, 56.444, 58.0702, 59.6964]::NUMERIC[], 8),
  ('DESPACHO STGO-COPIAPO (IDA)', '27 ton', 48, ARRAY[50.55, 52.25, 53.95, 55.65, 57.35, 59.05, 60.75]::NUMERIC[], 9),
  ('DESPACHO ADP-SANTIAGO', '5 ton', 8, ARRAY[8.1406, 8.2344, 8.3281, 8.4218, 8.5156, 8.6093, 8.7031]::NUMERIC[], 10);
