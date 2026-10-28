-- Módulo Picking: lista de productos que un cliente va a retirar, preparada antes de hacer el report.
-- Solo PRECARGA: no mueve stock ni crea movimientos. El stock se descuenta cuando el report se despacha
-- (igual que siempre); el picking solo agiliza llenar el Bodegaje del report y se imprime en PDF.
-- Estados: pendiente → en_report (cargado en un report) → despachado (el report se despachó) | anulado.
-- Acceso: super_admin, operador y operador_carga.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS picking_numero_seq START 1;

CREATE TABLE IF NOT EXISTS pickings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        INTEGER NOT NULL UNIQUE DEFAULT nextval('picking_numero_seq'),
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  referencia    TEXT,          -- solicitud / orden / listado del cliente
  observaciones TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_report', 'despachado', 'anulado')),
  report_id     UUID REFERENCES reports(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id),
  updated_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS picking_lineas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_id         UUID NOT NULL REFERENCES pickings(id) ON DELETE CASCADE,
  inventario_item_id UUID REFERENCES inventario_items(id) ON DELETE SET NULL,
  producto           TEXT NOT NULL,
  codigo             TEXT,
  clase_imo          TEXT,
  nu                 TEXT,
  bodega             TEXT,
  numero_pallet      TEXT,   -- UTI Chile
  rack               TEXT,   -- UTI Chile
  lote               TEXT,
  peso_neto          NUMERIC(14,2),
  posiciones         INTEGER,
  unidades           NUMERIC(14,2),
  orden              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pickings_cliente ON pickings(cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_pickings_report ON pickings(report_id);
CREATE INDEX IF NOT EXISTS idx_picking_lineas_picking ON picking_lineas(picking_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pickings', 'picking_lineas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "roles operativos" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "roles operativos" ON %I FOR ALL TO authenticated
         USING ((select current_user_role()) IN (''super_admin'', ''operador'', ''operador_carga''))
         WITH CHECK ((select current_user_role()) IN (''super_admin'', ''operador'', ''operador_carga''))', t);
  END LOOP;
END $$;

-- Cuando el report cargado con un picking se despacha, el picking pasa a "despachado".
CREATE OR REPLACE FUNCTION picking_report_despachado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'despachado' AND OLD.estado IS DISTINCT FROM 'despachado' THEN
    UPDATE pickings SET estado = 'despachado', updated_at = NOW()
     WHERE report_id = NEW.id AND estado = 'en_report';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS reports_picking_despachado ON reports;
CREATE TRIGGER reports_picking_despachado
  AFTER UPDATE OF estado ON reports
  FOR EACH ROW EXECUTE FUNCTION picking_report_despachado();

-- Verificación: si falta algo, se deshace todo.
DO $$
BEGIN
  IF to_regclass('public.pickings') IS NULL OR to_regclass('public.picking_lineas') IS NULL THEN
    RAISE EXCEPTION 'No se crearon las tablas del picking';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reports_picking_despachado') THEN
    RAISE EXCEPTION 'Falta el trigger reports_picking_despachado';
  END IF;
END $$;

COMMIT;
