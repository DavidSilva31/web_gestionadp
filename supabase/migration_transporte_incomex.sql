-- Módulo Transporte Incomex — registro de viajes de transporte subcontratado
-- facturados al cliente vía Incomex (ADP paga al transportista, factura al
-- cliente con margen). Se integra al HES como hoja propia, mostrando solo
-- lo facturado al cliente (factura_cliente_uf) — costo/margen quedan acá,
-- nunca en el documento que recibe el cliente.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE SEQUENCE IF NOT EXISTS transporte_incomex_seq START 1;

CREATE TABLE IF NOT EXISTS transporte_incomex (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                  INTEGER DEFAULT nextval('transporte_incomex_seq') UNIQUE NOT NULL,
  cliente_id              UUID REFERENCES clientes(id),
  empresa_texto           TEXT NOT NULL,      -- valor crudo de la columna EMPRESA del Excel origen
  fecha                   DATE NOT NULL,
  guia_numero             TEXT,
  tipo_movimiento         TEXT,
  origen_destino          TEXT,
  detalle_carga           TEXT,
  sigla_contenedor        TEXT,
  transportista           TEXT,               -- empresa de camiones subcontratada (texto libre, no FK)
  conductor               TEXT,
  tarifa_tte_clp          NUMERIC(12,2),       -- pagado al transportista, CLP
  costo_uf                NUMERIC(10,4),       -- mismo pago en UF
  factura_cliente_uf      NUMERIC(10,4),       -- Factura Incomex cliente NETO (UF) — esto va al HES
  factura_adp_incomex_uf  NUMERIC(10,4),       -- margen de ADP — nunca al HES
  observaciones           TEXT,
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_transporte_incomex_cliente_fecha ON transporte_incomex(cliente_id, fecha);

ALTER TABLE transporte_incomex ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven transporte incomex" ON transporte_incomex
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operador y superadmin crean transporte incomex" ON transporte_incomex
  FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('operador','super_admin'));

CREATE POLICY "Operador y superadmin actualizan transporte incomex" ON transporte_incomex
  FOR UPDATE TO authenticated USING (current_user_role() IN ('operador','super_admin'));

CREATE OR REPLACE TRIGGER transporte_incomex_updated_at
  BEFORE UPDATE ON transporte_incomex
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
