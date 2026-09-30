-- Migración: código de verificación de 5 dígitos en la esquina superior
-- derecha del recuadro "Antecedentes" del PDF — los 5 dígitos siempre suman
-- 15 (el orden no importa), y cada report que se crea recibe uno nuevo.
-- Se genera a nivel de BD (no en el código de la app) para que quede
-- garantizado sin importar desde dónde se inserte un report.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS codigo_verificacion TEXT;

CREATE OR REPLACE FUNCTION generar_codigo_verificacion_reports()
RETURNS TRIGGER AS $$
DECLARE
  d1 INTEGER; d2 INTEGER; d3 INTEGER; d4 INTEGER; d5 INTEGER;
BEGIN
  IF NEW.codigo_verificacion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    d1 := floor(random() * 10)::int;
    d2 := floor(random() * 10)::int;
    d3 := floor(random() * 10)::int;
    d4 := floor(random() * 10)::int;
    d5 := floor(random() * 10)::int;
    EXIT WHEN d1 + d2 + d3 + d4 + d5 = 15;
  END LOOP;

  NEW.codigo_verificacion := d1::text || d2::text || d3::text || d4::text || d5::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS reports_generar_codigo_verificacion ON reports;
CREATE TRIGGER reports_generar_codigo_verificacion
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION generar_codigo_verificacion_reports();

-- Backfill de los reports ya existentes (para que también muestren uno en
-- su PDF, no solo los nuevos de acá en adelante). Se desactiva el trigger
-- de validación de transición de estado mientras dura el backfill — sin
-- esto, los reports 'anulado' rechazan cualquier UPDATE que no sea de
-- super_admin/Javier Navarro (y en el SQL Editor auth.uid() es NULL).
ALTER TABLE reports DISABLE TRIGGER validate_report_transition_trigger;

DO $$
DECLARE
  r RECORD;
  d1 INTEGER; d2 INTEGER; d3 INTEGER; d4 INTEGER; d5 INTEGER;
BEGIN
  FOR r IN SELECT id FROM reports WHERE codigo_verificacion IS NULL LOOP
    LOOP
      d1 := floor(random() * 10)::int;
      d2 := floor(random() * 10)::int;
      d3 := floor(random() * 10)::int;
      d4 := floor(random() * 10)::int;
      d5 := floor(random() * 10)::int;
      EXIT WHEN d1 + d2 + d3 + d4 + d5 = 15;
    END LOOP;
    UPDATE reports SET codigo_verificacion = d1::text || d2::text || d3::text || d4::text || d5::text WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE reports ENABLE TRIGGER validate_report_transition_trigger;
