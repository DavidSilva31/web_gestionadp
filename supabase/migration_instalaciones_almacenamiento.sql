-- Migración: catálogo de referencia de instalaciones de almacenamiento
-- (bodegas y patios reales de Altos del Puerto), con su capacidad máxima,
-- las clases IMO/sustancias que cada una está autorizada a almacenar, y su
-- resolución sanitaria. Es solo catálogo de referencia por ahora — no se
-- vincula todavía a inventario_items (eso queda para una segunda etapa).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS instalaciones_almacenamiento (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                       TEXT NOT NULL,           -- "106-1", "Patio de almacenamiento N°1", "22-4"...
  tipo                         TEXT NOT NULL CHECK (tipo IN ('Bodega', 'Patio')),
  capacidad                    TEXT NOT NULL,           -- texto libre: "700 ton", "18 posiciones... 800 ton", "170 m2"
  resolucion_sanitaria_numero  TEXT,
  resolucion_sanitaria_fecha   DATE,
  orden                        INTEGER NOT NULL DEFAULT 0,
  activo                       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instalacion_sustancias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalacion_id  UUID NOT NULL REFERENCES instalaciones_almacenamiento(id) ON DELETE CASCADE,
  sustancia       TEXT NOT NULL,   -- "Comburentes", "Sustancias tóxicas", "Aceite usado"...
  clase_imo       TEXT,            -- "5.1", "9"... NULL para residuos RESPEL sin clase IMO
  orden           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_instalacion_sustancias_instalacion ON instalacion_sustancias(instalacion_id);

CREATE OR REPLACE TRIGGER instalaciones_updated_at
  BEFORE UPDATE ON instalaciones_almacenamiento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE instalaciones_almacenamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE instalacion_sustancias       ENABLE ROW LEVEL SECURITY;

-- Referencia operativa — visible para cualquier autenticado (incl.
-- operador_carga, que ya ve /inventario); solo operador+ puede editar.
CREATE POLICY "Autenticados leen instalaciones"
  ON instalaciones_almacenamiento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operadores editan instalaciones"
  ON instalaciones_almacenamiento FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Autenticados leen instalacion_sustancias"
  ON instalacion_sustancias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operadores editan instalacion_sustancias"
  ON instalacion_sustancias FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));
