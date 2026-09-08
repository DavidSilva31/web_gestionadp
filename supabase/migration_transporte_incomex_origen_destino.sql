-- Migración: el trigger que auto-genera la fila de Transporte ADP desde un
-- report (transporte_tipo='propio') ahora también precarga Origen-Destino:
-- si el movimiento del report es "ingreso" (el camión trae carga hacia ADP),
-- el destino siempre es ADP; si es "despacho" (el camión retira carga desde
-- ADP), el origen siempre es ADP. El otro lado queda en blanco para que
-- quien complete la facturación escriba el lugar real.
-- Se usa sec1_tipo_movimiento (Depósito de Contenedores) y, si no hay, se
-- cae a sec3_tipo (Bodegaje) — el mismo patrón de respaldo que ya usa este
-- trigger para el número de guía.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION sync_transporte_incomex_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_id    UUID;
  v_guia          TEXT;
  v_movimiento    TEXT;
  v_origen_destino TEXT;
BEGIN
  IF NEW.transporte_tipo = 'propio' THEN
    SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;
    v_guia       := COALESCE(NEW.sec1_guia_numero, NEW.sec3_numero_guia);
    v_movimiento := COALESCE(NEW.sec1_tipo_movimiento, NEW.sec3_tipo);
    v_origen_destino := CASE v_movimiento
      WHEN 'ingreso'  THEN '-ADP'
      WHEN 'despacho' THEN 'ADP-'
      ELSE NULL
    END;

    INSERT INTO transporte_incomex (
      report_id, cliente_id, empresa_texto, fecha, guia_numero, origen_destino, sigla_contenedor, conductor, activo
    ) VALUES (
      NEW.id, v_cliente_id, NEW.cliente, NEW.fecha, v_guia, v_origen_destino, NEW.sec1_sigla, NEW.conductor, true
    )
    ON CONFLICT (report_id) DO UPDATE SET
      cliente_id       = EXCLUDED.cliente_id,
      empresa_texto    = EXCLUDED.empresa_texto,
      fecha            = EXCLUDED.fecha,
      guia_numero      = EXCLUDED.guia_numero,
      origen_destino   = EXCLUDED.origen_destino,
      sigla_contenedor = EXCLUDED.sigla_contenedor,
      conductor        = EXCLUDED.conductor,
      activo           = true;

  ELSIF TG_OP = 'UPDATE' AND OLD.transporte_tipo = 'propio' AND NEW.transporte_tipo <> 'propio' THEN
    UPDATE transporte_incomex SET activo = false WHERE report_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
