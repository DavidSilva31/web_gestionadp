-- Módulo de Cotizaciones (migrado desde el portal Grails "Gestión de OC y Cotizaciones").
-- Acceso: solo super_admin. Catálogos (ítems, categorías, observaciones) se cargan
-- completos desde el portal. Cotizaciones arrancan desde el número 1 (sin histórico).

-- ── Tablas ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS items_cotizacion_categorias (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  TEXT NOT NULL UNIQUE,
  activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS items_cotizacion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  valor_unitario  NUMERIC(14,4),
  categoria_id    UUID NOT NULL REFERENCES items_cotizacion_categorias(id) ON DELETE RESTRICT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observacion_tipos (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS observaciones_cotizacion (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id   UUID NOT NULL REFERENCES observacion_tipos(id) ON DELETE RESTRICT,
  texto     TEXT NOT NULL,
  activo    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE SEQUENCE IF NOT EXISTS cotizacion_numero_seq START 1;

CREATE TABLE IF NOT EXISTS cotizaciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              INTEGER NOT NULL UNIQUE DEFAULT nextval('cotizacion_numero_seq'),
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  emisor              TEXT NOT NULL CHECK (emisor IN ('Altos del Puerto', 'Incomex', 'Mar Azul')),
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  atencion            TEXT,
  ciudad              TEXT,
  direccion           TEXT,
  valor_uf            NUMERIC(14,4) NOT NULL,
  neto                NUMERIC(16,2) NOT NULL DEFAULT 0,
  iva                 NUMERIC(16,2) NOT NULL DEFAULT 0,
  total               NUMERIC(16,2) NOT NULL DEFAULT 0,
  observaciones_extra TEXT,
  created_by          UUID REFERENCES auth.users(id),
  updated_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cotizacion_lineas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES items_cotizacion(id) ON DELETE SET NULL,
  cantidad        NUMERIC(14,2) NOT NULL DEFAULT 1,
  descripcion     TEXT NOT NULL,
  valor_uf        NUMERIC(14,4) NOT NULL DEFAULT 0,
  descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  orden           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cotizacion_observaciones (
  cotizacion_id   UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  observacion_id  UUID NOT NULL REFERENCES observaciones_cotizacion(id) ON DELETE RESTRICT,
  PRIMARY KEY (cotizacion_id, observacion_id)
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_lineas_cot ON cotizacion_lineas(cotizacion_id);

-- ── RLS: solo super_admin ─────────────────────────────────────────────────────

ALTER TABLE items_cotizacion_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_cotizacion            ENABLE ROW LEVEL SECURITY;
ALTER TABLE observacion_tipos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE observaciones_cotizacion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_lineas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_observaciones    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'items_cotizacion_categorias','items_cotizacion','observacion_tipos',
    'observaciones_cotizacion','cotizaciones','cotizacion_lineas','cotizacion_observaciones'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "solo super_admin" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "solo super_admin" ON %I FOR ALL TO authenticated
         USING (current_user_role() = ''super_admin'')
         WITH CHECK (current_user_role() = ''super_admin'')', t);
  END LOOP;
END $$;

-- ── Datos: categorías ────────────────────────────────────────────────────────

INSERT INTO items_cotizacion_categorias (nombre) VALUES
  ('Almacenaje Indoor'),
  ('Almacenaje Outdoor'),
  ('Arriendo/Venta de Equipo y Transporte'),
  ('DESCONSOLIDACION'),
  ('Otros Servicios')
ON CONFLICT (nombre) DO NOTHING;

-- ── Datos: tipos de observación ──────────────────────────────────────────────

INSERT INTO observacion_tipos (nombre) VALUES
  ('OBSERVACIONES DE TRANSPORTE'),
  ('OBSERVACIONES DEL ALMACENAJE'),
  ('OBSERVACIONES GENERALES')
ON CONFLICT (nombre) DO NOTHING;

-- ── Datos: ítems (33, tal como están en el portal; valor 1 y los demás sin descripción) ──

INSERT INTO items_cotizacion (nombre, valor_unitario, categoria_id)
SELECT v.nombre, v.valor, c.id
FROM (VALUES
  ('IMO 2', 1, 'Almacenaje Indoor'),
  ('Línea manual', 2, 'Otros Servicios'),
  ('IMO 3', 3, 'Almacenaje Indoor'),
  ('IMO 4', 4, 'Almacenaje Indoor'),
  ('IMO 5', 5, 'Almacenaje Indoor'),
  ('IMO 6', 6, 'Almacenaje Indoor'),
  ('IMO 8', 7, 'Almacenaje Indoor'),
  ('IMO 9', 8, 'Almacenaje Indoor'),
  ('RESPEL', 9, 'Almacenaje Indoor'),
  ('Arriendo de Bodega', 10, 'Almacenaje Indoor'),
  ('Línea manual', 11, 'Almacenaje Indoor'),
  ('Isotanque y/o Contenedor IMO 3', 12, 'Almacenaje Outdoor'),
  ('Isotanque y/o Contenedor IMO 5', 13, 'Almacenaje Outdoor'),
  ('Isotanque y/o Contenedor IMO 6', 14, 'Almacenaje Outdoor'),
  ('Isotanque y/o Contenedor IMO 8', 15, 'Almacenaje Outdoor'),
  ('Isotanque y/o Contenedor IMO 9', 16, 'Almacenaje Outdoor'),
  ('Depósito de Contenedores 20"', 17, 'Almacenaje Outdoor'),
  ('Depósito de Contenedores 40"', 18, 'Almacenaje Outdoor'),
  ('Uso de área (Línea manual)', 19, 'Almacenaje Outdoor'),
  ('DESCON. 20 IMO', 45, 'DESCONSOLIDACION'),
  ('Almacenaje de alimentos', 1, 'Almacenaje Indoor'),
  ('Almacenaje de carga normal', 1, 'Almacenaje Indoor'),
  ('Isotanque y/o Contenedor IMO 2', 1, 'Almacenaje Outdoor'),
  ('Isotanque y/o Contenedor IMO 4', 1, 'Almacenaje Outdoor'),
  ('Desconsolidación IMO 40`', 1, 'DESCONSOLIDACION'),
  ('Desconsolidación 40`', 1, 'DESCONSOLIDACION'),
  ('Desconsolidación 20`', 1, 'DESCONSOLIDACION'),
  ('Servicio de retiro y transporte de RILES en camión de succión de 12 m3', 1, 'Arriendo/Venta de Equipo y Transporte'),
  ('Porteo VAP - Altos del Puerto', 1, 'Arriendo/Venta de Equipo y Transporte'),
  ('Porteo SAI - Altos del Puerto', 1, 'Arriendo/Venta de Equipo y Transporte'),
  ('Despacho de carga suelta Altos del Puerto - Santiago en camión de 5.000 Kg', 1, 'Arriendo/Venta de Equipo y Transporte'),
  ('Despacho de carga suelta Altos del Puerto - Santiago en camión rampla', 1, 'Arriendo/Venta de Equipo y Transporte'),
  ('Línea manual', 1, 'Arriendo/Venta de Equipo y Transporte')
) AS v(nombre, valor, categoria)
JOIN items_cotizacion_categorias c ON c.nombre = v.categoria;

-- ── Datos: observaciones (26) ─────────────────────────────────────────────────

INSERT INTO observaciones_cotizacion (tipo_id, texto)
SELECT t.id, v.texto
FROM (VALUES
  ('OBSERVACIONES DE TRANSPORTE', 'No se extraen residuos sólidos que puedan tapar o romper las mangueras ( piedras, basura, trapos, etc. ).'),
  ('OBSERVACIONES DE TRANSPORTE', 'La presente cotización incluye el costo de disposición final.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'El arrendatario debe proporcionar las Hojas de Seguridad de los productos a almacenar y toda la carga debe estar etiquetada con logos respectivos.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'La empresa posee resolución sanitaria para el almacenaje de sustancias peligrosas (Resolución Sanitaria 192, Ene/2013; Modificación R.S. 3195, Oct/2013) en bodega y Resolución Sanitaria 409, Abr/2015 para Losa de Isotanques.'),
  ('OBSERVACIONES DE TRANSPORTE', 'Carga y descarga por parte del cliente estando al interior de recinto.'),
  ('OBSERVACIONES GENERALES', 'Forma de Pago: Pago a 30 días desde la fecha de emisión de la factura.'),
  ('OBSERVACIONES GENERALES', 'La validez de esta cotización es de 15 días.'),
  ('OBSERVACIONES DE TRANSPORTE', 'La capacidad máxima de almacenamiento en el estanque es de 25m3.'),
  ('OBSERVACIONES DE TRANSPORTE', 'La presente cotización no incluye el costo de disposición final.'),
  ('OBSERVACIONES DE TRANSPORTE', 'La capacidad máxima de almacenamiento en el estanque es de 12m3.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'Las instalaciones cumplen con lo establecido en el D.S. 78/09 y cuentan con todas las infraestructuras de seguridad, tales como: red húmeda, extintores, extractores de aire, instalaciones eléctricas anti explosivas, detectores de incendio, cámaras de vigilancia, Brigada de emergencia, etc.'),
  ('OBSERVACIONES DE TRANSPORTE', 'Los servicios deben ser programados con una anticipación mínima de 24 horas.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'Se entenderá por "Ingreso y Despacho" de Isotanques al servicio de descarga y carga de éstos.'),
  ('OBSERVACIONES DE TRANSPORTE', 'El cliente debe facilitar el acceso y trabajo del camión y sus equipos.'),
  ('OBSERVACIONES DE TRANSPORTE', 'El camión cuenta con Sistema GPS.'),
  ('OBSERVACIONES DE TRANSPORTE', 'El servicio considera el uso de mangueras de succión ( hasta 35 metros ).'),
  ('OBSERVACIONES DE TRANSPORTE', 'Flete falso tendrá un valor del 85% del valor del servicio.'),
  ('OBSERVACIONES DE TRANSPORTE', 'Servicio considera hasta 3 horas de carga y/o descarga. Valor por cada hora adicional de sobreestadía 1,53 UF más IVA.'),
  ('OBSERVACIONES DE TRANSPORTE', 'Servicio incluye seguro de carga.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'Se entenderá por ingreso o salida de pallets (In/Out) a cada movimiento desde o hacia bodega.'),
  ('OBSERVACIONES DEL ALMACENAJE', 'Los pallets que serán almacenados deberán cumplir con las siguientes medidas: W=1,2mt ; L=1,2mt ; H=1,35mt.'),
  ('OBSERVACIONES GENERALES', 'La aceptación de la presente cotización deberá hacerse mediante una de las siguientes alternativas: Contrato, Orden de compra o Pago anticipado.'),
  ('OBSERVACIONES GENERALES', 'Los valores expresados en la presente cotización son netos.'),
  ('OBSERVACIONES GENERALES', 'De aceptar la presente cotización se solicita enviar Orden de Compra firmada y timbrada a los siguientes datos: R. SOCIAL: Asalgado e Izurieta Ltda, RUT: 76.499.190-7, GIRO: Importadora y Bodegaje, DIRECCIÓN: Camino La Pólvora, 106, Valparaíso.'),
  ('OBSERVACIONES GENERALES', 'Se informa que el valor UF a considerar en factura es el correspondiente al último día del mes en facturación.'),
  ('OBSERVACIONES GENERALES', 'Horario de atención: Lunes a Viernes de 08:00 h a 13:00 h y 14:00 h a 17:00 . Habilitación horario adicional: 3 UF + IVA (Considera turno de 8 horas).')
) AS v(tipo, texto)
JOIN observacion_tipos t ON t.nombre = v.tipo;
