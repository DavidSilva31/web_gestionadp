-- Módulo "Equipos" (Administración): notebooks/PCs y tablets entregados a trabajadores,
-- con su encargado y el acta de responsabilidad firmada (PDF/imagen).
-- Acceso: solo super_admin (tablas y bucket de actas).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS equipos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          TEXT NOT NULL CHECK (tipo IN ('Notebook / PC', 'Tablet')),
  marca         TEXT NOT NULL,
  modelo        TEXT NOT NULL,
  numero_serie  TEXT,
  observaciones TEXT,
  estado        TEXT NOT NULL DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Asignado', 'En reparación', 'Dado de baja')),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- No se repite un N° de serie (los equipos sin serie quedan fuera del índice).
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipos_serie ON equipos (UPPER(TRIM(numero_serie))) WHERE numero_serie IS NOT NULL AND TRIM(numero_serie) <> '';

-- Cada entrega a un encargado. La vigente es la que no tiene fecha_devolucion.
CREATE TABLE IF NOT EXISTS equipo_asignaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id        UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  encargado_nombre TEXT NOT NULL,
  encargado_rut    TEXT,
  encargado_cargo  TEXT,
  fecha_entrega    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_devolucion DATE,
  acta_path        TEXT,   -- archivo en el bucket "equipos-actas"
  observaciones    TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Un equipo no puede tener dos entregas vigentes a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_asignacion_vigente ON equipo_asignaciones (equipo_id) WHERE fecha_devolucion IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_asignaciones_equipo ON equipo_asignaciones (equipo_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipos', 'equipo_asignaciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "solo super_admin" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "solo super_admin" ON %I FOR ALL TO authenticated
         USING (current_user_role() = ''super_admin'')
         WITH CHECK (current_user_role() = ''super_admin'')', t);
  END LOOP;
END $$;

-- Bucket privado para las actas (PDF/JPG/PNG, 10 MB), solo super_admin.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipos-actas', 'equipos-actas', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "super_admin lee equipos-actas" ON storage.objects;
CREATE POLICY "super_admin lee equipos-actas" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipos-actas' AND current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin sube equipos-actas" ON storage.objects;
CREATE POLICY "super_admin sube equipos-actas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipos-actas' AND current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "super_admin borra equipos-actas" ON storage.objects;
CREATE POLICY "super_admin borra equipos-actas" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipos-actas' AND current_user_role() = 'super_admin');
