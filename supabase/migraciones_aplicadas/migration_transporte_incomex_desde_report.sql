-- Vincula reports con Transporte Incomex: al guardar un report con
-- transporte_tipo='propio' ("Transporte ADP"), se crea (o actualiza) una
-- fila en transporte_incomex precargada con cliente/fecha/guía/conductor,
-- lista para que alguien complete transportista/tarifa/factura después.
-- Si el report pasa de "Transporte ADP" a "Transporte Cliente" (externo),
-- la fila generada se desactiva (no se borra — puede tener facturación ya
-- cargada a mano).
--
-- SECURITY DEFINER: transporte_incomex solo admite INSERT/UPDATE a
-- Operador+ (migration_transporte_incomex.sql) — sin esto, el trigger
-- fallaría cuando lo dispara operador_carga al crear/editar su report.

-- ── 1) Vínculo report_id — un report tiene a lo sumo una fila Incomex ──────
ALTER TABLE transporte_incomex ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES reports(id) ON DELETE SET NULL;
-- UNIQUE normal, no parcial: un índice parcial (WHERE report_id IS NOT NULL)
-- no calza como "arbiter" del ON CONFLICT (report_id) de abajo. Un UNIQUE
-- normal sobre una columna nullable ya permite múltiples NULL sin problema.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transporte_incomex_report_id ON transporte_incomex(report_id);

-- ── 2) Trigger de sincronización ────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_transporte_incomex_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_id UUID;
  v_guia       TEXT;
BEGIN
  IF NEW.transporte_tipo = 'propio' THEN
    SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;
    v_guia := COALESCE(NEW.sec1_guia_numero, NEW.sec3_numero_guia);

    INSERT INTO transporte_incomex (
      report_id, cliente_id, empresa_texto, fecha, guia_numero, sigla_contenedor, conductor, activo
    ) VALUES (
      NEW.id, v_cliente_id, NEW.cliente, NEW.fecha, v_guia, NEW.sec1_sigla, NEW.conductor, true
    )
    ON CONFLICT (report_id) DO UPDATE SET
      cliente_id       = EXCLUDED.cliente_id,
      empresa_texto    = EXCLUDED.empresa_texto,
      fecha            = EXCLUDED.fecha,
      guia_numero      = EXCLUDED.guia_numero,
      sigla_contenedor = EXCLUDED.sigla_contenedor,
      conductor        = EXCLUDED.conductor,
      activo           = true;

  ELSIF TG_OP = 'UPDATE' AND OLD.transporte_tipo = 'propio' AND NEW.transporte_tipo <> 'propio' THEN
    UPDATE transporte_incomex SET activo = false WHERE report_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS reports_sync_transporte_incomex ON reports;
CREATE TRIGGER reports_sync_transporte_incomex
  AFTER INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_transporte_incomex_from_report();
