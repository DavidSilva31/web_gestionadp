-- sync_transporte_incomex_from_report() creaba la fila en transporte_incomex
-- apenas se guardaba un report con Transporte ADP, sin importar el estado
-- (borrador/pendiente_operaciones/pendiente_despacho) — aparecía en el
-- módulo Transporte Incomex mucho antes de que el vehículo saliera. A
-- pedido explícito: recién debe aparecer cuando el report queda
-- "despachado".
--
-- SECURITY DEFINER: igual que antes, transporte_incomex solo admite
-- INSERT/UPDATE a Operador+ — sin esto el trigger falla cuando lo dispara
-- un rol distinto al despachar.

CREATE OR REPLACE FUNCTION sync_transporte_incomex_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_id UUID;
  v_guia       TEXT;
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.estado END;
BEGIN
  IF NEW.transporte_tipo = 'propio' AND NEW.estado = 'despachado' AND COALESCE(v_old_estado, '') <> 'despachado' THEN
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
