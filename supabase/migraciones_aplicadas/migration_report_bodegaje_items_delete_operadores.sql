-- Causa de los productos de Bodegaje duplicados al editar un report (ej. report 289):
-- la política DELETE de report_bodegaje_items solo dejaba borrar al creador del report o a un super_admin.
-- Al guardar, la app borra las líneas y las vuelve a insertar; si quien edita es otro operador, el DELETE
-- no borraba nada (RLS filtra en silencio, sin error) y el INSERT agregaba una copia nueva encima.
-- Ahora cualquier rol operativo puede reemplazar las líneas. Un report despachado sigue protegido por el
-- trigger report_bodegaje_items_lock. Ejecutar una sola vez en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Eliminar report_bodegaje_items" ON report_bodegaje_items;
CREATE POLICY "Eliminar report_bodegaje_items"
  ON report_bodegaje_items FOR DELETE TO authenticated
  USING (
    (select current_user_role()) IN ('super_admin', 'operador', 'operador_carga')
    OR EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_bodegaje_items.report_id AND r.created_by = auth.uid()
    )
  );
