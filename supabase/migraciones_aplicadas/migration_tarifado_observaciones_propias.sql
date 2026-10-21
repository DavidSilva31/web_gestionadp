-- Tarifado Transporte: observaciones propias (las de la hoja AJUSTADA de
-- docs/TARIFADO ESCALONADO.xlsx) en vez de las del catálogo de Cotizaciones.
-- "tarifado_observaciones" (todavía vacía) pasa a apuntar al nuevo catálogo.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de migration_tarifado_transporte.sql.

CREATE TABLE IF NOT EXISTS tarifado_obs_catalogo (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto  TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE tarifado_obs_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solo super_admin" ON tarifado_obs_catalogo;
CREATE POLICY "solo super_admin" ON tarifado_obs_catalogo FOR ALL TO authenticated
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

INSERT INTO tarifado_obs_catalogo (texto, orden) VALUES
  ('Tal como se muestra, el presente tarifado es escalonado según variación de valor del diesel, por tramo.', 0),
  ('Servicios de transporte de carga suelta incluyen 3 horas libres en carga o descarga (desde que camión ingresa hasta que se retira de recinto). * Valor por sobre estadía: 1 UF/HORA', 1),
  ('Aplica 100% de tarifa falso flete cuando el transporte llega al punto de servicio y por diversos motivos no es posible retirar la carga por factores externos al transporte.', 2),
  ('Aplica 85% de tarifa falso flete en caso de cancelación de servicio sin anticipación previa (horario tope de aviso 18:00 h de día hábil anterior a servicio).', 3),
  ('Las presentes tarifas no consideran costos adicionales por permisos especiales de vialidad, escolta de carabineros, etc.', 4),
  ('Todos los servicios deben coordinarse formalmente a correo operaciones@altosdelpuerto.cl', 5);

DROP TABLE IF EXISTS tarifado_observaciones;
CREATE TABLE tarifado_observaciones (
  tarifado_id    UUID NOT NULL REFERENCES tarifados(id) ON DELETE CASCADE,
  observacion_id UUID NOT NULL REFERENCES tarifado_obs_catalogo(id) ON DELETE RESTRICT,
  PRIMARY KEY (tarifado_id, observacion_id)
);

ALTER TABLE tarifado_observaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solo super_admin" ON tarifado_observaciones FOR ALL TO authenticated
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');
