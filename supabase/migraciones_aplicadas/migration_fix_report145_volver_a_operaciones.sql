-- Corrección puntual: el report #145 (HELSON MUÑOZ Y CÍA. LTDA.) se envió a la cola
-- de despacho sin productos ni secciones completadas (Recepción pulsó "Enviar a
-- despacho" sin pasar por el llenado de Operaciones). Se devuelve un paso, a
-- "pendiente_operaciones", para que Operaciones cargue el producto y lo envíe a
-- despacho como corresponde.
--
-- También se limpia nombre_operador: se había autocompletado con "RECEPCIÓN" y, si
-- queda, el formulario ya no autocompleta el nombre de quien lo llena en Operaciones.
--
-- validate_report_transition_trigger impide retroceder un report que está en
-- pendiente_despacho, y en el SQL Editor auth.uid() es NULL (no pasa el bypass de
-- editor total), así que se desactiva un instante. El report no tiene firmas ni
-- movimientos, y los demás triggers solo actúan al pasar a/desde "despachado".
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports DISABLE TRIGGER validate_report_transition_trigger;

UPDATE reports
   SET estado = 'pendiente_operaciones', nombre_operador = NULL
 WHERE numero = 145 AND estado = 'pendiente_despacho';

ALTER TABLE reports ENABLE TRIGGER validate_report_transition_trigger;
