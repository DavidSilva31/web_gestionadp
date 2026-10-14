-- Sección 1 — Depósito de Contenedores: "Almacenaje Full" y "Almacenaje Vacío".
--
-- No son tipos de contenedor (esos siguen siendo 20ft, 40ft e isotanque): son
-- una elección aparte que aplica a 20ft/40ft y significa ingresar o despachar
-- el contenedor ENTERO (con carga = 'full', o vacío = 'vacio'), igual que un
-- isotanque. Esos reports se cierran al despachar el camión.
-- Un 20ft/40ft sin ninguno de los dos queda en NULL y es el caso que pasa a
-- Operaciones (estado 'en_proceso': consolidado/desconsolidado) — ver
-- migration_reports_en_proceso.sql.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS sec1_almacenaje TEXT
  CHECK (sec1_almacenaje IN ('full', 'vacio'));
