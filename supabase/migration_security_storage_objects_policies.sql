-- Fix MEDIO (auditoría de seguridad): las políticas RLS de storage.objects
-- para el bucket "reports-firmados" nunca quedaron versionadas en el repo
-- (se configuraron a mano desde el Dashboard) — no había forma de auditarlas
-- ni de saber qué quedó configurado realmente. Este archivo las deja
-- explícitas y en control de versiones.
--
-- Criterio: mismo nivel de confianza que ya usa "reports" en todo el
-- sistema (política "Autenticados leen reports" USING(true), documentada en
-- supabase_security_fixes.sql como diseño intencional — "sistema interno de
-- usuarios confiables administrados manualmente"). Los archivos de este
-- bucket (firma del conductor, HDS, evidencia fotográfica, documento de
-- despacho firmado) son parte del mismo report — restringirlos más que el
-- propio report sería inconsistente, no más seguro. El bucket ya es privado
-- (confirmado: public=false) y desde julio de 2026 tiene file_size_limit
-- 10 MB y allowed_mime_types limitado a pdf/jpg/png — así que el único
-- acceso posible es autenticado, con tipo/tamaño ya acotados en el bucket.
--
-- Idempotente: DROP POLICY IF EXISTS antes de crear, seguro de re-correr.

DROP POLICY IF EXISTS "Autenticados leen reports-firmados" ON storage.objects;
CREATE POLICY "Autenticados leen reports-firmados"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports-firmados');

DROP POLICY IF EXISTS "Autenticados suben reports-firmados" ON storage.objects;
CREATE POLICY "Autenticados suben reports-firmados"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports-firmados');

DROP POLICY IF EXISTS "Autenticados actualizan reports-firmados" ON storage.objects;
CREATE POLICY "Autenticados actualizan reports-firmados"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'reports-firmados')
  WITH CHECK (bucket_id = 'reports-firmados');

-- Sin política de DELETE a propósito — nadie borra estos archivos desde la
-- app hoy (ni siquiera al eliminar un report), y sin política, RLS deniega
-- por defecto.
