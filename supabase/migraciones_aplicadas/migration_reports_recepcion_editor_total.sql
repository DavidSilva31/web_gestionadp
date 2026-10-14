-- La cuenta Recepción (recepcion@altosdelpuerto.cl, rol operador) queda con el
-- mismo permiso que Javier Navarro: editar cualquier campo de un report en
-- cualquier estado, incluido despachado y anulado.
-- Si el permiso debe extenderse a otro usuario más adelante, agregar su UUID acá.

CREATE OR REPLACE FUNCTION es_editor_total_reports(p_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = p_uid AND role = 'super_admin')
    OR p_uid = 'd0ef84af-0d9b-43b6-83bf-76f5b99b7e6f'::uuid -- Javier Navarro
    OR p_uid = 'b920ffd6-2aad-44c7-be98-434a2dd799d4'::uuid -- Recepción
$$ LANGUAGE sql STABLE SET search_path = public;
