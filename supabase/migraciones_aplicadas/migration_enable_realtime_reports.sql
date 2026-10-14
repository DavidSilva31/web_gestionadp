-- Habilita Supabase Realtime (postgres_changes) para reports y audit_logs.
-- Sin esto, cualquier suscripción realtime a estas tablas se une al canal
-- pero el servidor rechaza el postgres_changes con:
--   "Unable to subscribe to changes with given parameters. Please check
--    Realtime is enabled for the given connect parameters..."
-- Verificado directo contra el WebSocket (dev y build de producción).
-- Afecta: /reports y /reports/despacho (nuevo — se actualizan solos al
-- crear/cambiar de estado un report) y la campanita de notificaciones
-- (ya existía, tenía el mismo problema sin que se hubiera notado).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER PUBLICATION supabase_realtime ADD TABLE reports;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
