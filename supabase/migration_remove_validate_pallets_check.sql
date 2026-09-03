-- Saca ambos chequeos de validate_report_transition()
-- (migration_fix_validate_report_transition_pendiente_operaciones.sql) —
-- a pedido explícito:
--   1) "Bodegaje activo requiere sec3_numero_pallets > 0 antes de enviar a
--      despacho" (ya sacado en una pasada anterior de este mismo archivo).
--   2) "No se puede despachar un report sin documento firmado" — el modal
--      de despacho rápido en /reports (a diferencia de la cola dedicada en
--      /reports/despacho) nunca pidió subir un archivo, así que este
--      chequeo lo bloqueaba siempre.
--
-- La función queda sin validaciones — se conserva por si se necesita
-- agregar una nueva regla más adelante, en vez de eliminar el trigger.

CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
