-- ═══════════════════════════════════════════════════════════════════
-- DEMO DATA — HES · Julio 2026
-- Ejecutar en Supabase SQL Editor DESPUÉS de demo_data.sql
-- Genera datos suficientes para probar el Excel HES de Brenntag y BASF
-- ═══════════════════════════════════════════════════════════════════


-- ── 0. Clientes demo (si no existen) ─────────────────────────────────────────

INSERT INTO clientes (nombre, rut, contacto, email, sector, activo)
SELECT 'Brenntag Chile SpA', '76.184.923-1', 'Carlos Vega', 'cvega@brenntag.cl', 'Químicos', true
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'Brenntag Chile SpA');

INSERT INTO clientes (nombre, rut, contacto, email, sector, activo)
SELECT 'BASF Chile Ltda.', '78.531.204-9', 'Ana Rodríguez', 'arodriguez@basf.com', 'Químicos industriales', true
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'BASF Chile Ltda.');

INSERT INTO clientes (nombre, rut, contacto, email, sector, activo)
SELECT 'Air Liquide Chile S.A.', '79.642.315-K', 'Roberto Fuentes', 'rfuentes@airliquide.com', 'Gases industriales', true
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'Air Liquide Chile S.A.');


-- ── 1. Tarifas por cliente ────────────────────────────────────────────────────

INSERT INTO tarifas_cliente (
  cliente_id, cotizacion_numero, clase_imo,
  tarifa_almacenaje_uf, tarifa_inout_uf,
  tarifa_descons_20_uf, tarifa_descons_40_uf,
  tarifa_consolid_40_uf, tarifa_porteo_uf,
  tarifa_palletizado_uf, facturacion_minima_uf, activo
)
VALUES
  -- Brenntag Chile SpA
  (
    (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
    'COT-2026-001', '8',
    0.0850,   -- tarifa almacenaje UF/pallet-día
    0.0600,   -- tarifa ingreso/salida
    1.2000,   -- desconsolidado 20ft
    1.8000,   -- desconsolidado 40ft
    1.5000,   -- consolidado 40ft
    0.4000,   -- porteo
    0.1500,   -- palletizado
    8.00,     -- facturación mínima UF
    true
  ),

  -- BASF Chile Ltda.
  (
    (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
    'COT-2026-002', '3',
    0.0950,
    0.0700,
    1.4000,
    2.0000,
    1.8000,
    0.5000,
    0.1800,
    10.00,
    true
  ),

  -- Air Liquide Chile S.A.
  (
    (SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
    'COT-2026-003', '2.2',
    0.1200,
    0.0800,
    NULL,
    NULL,
    NULL,
    0.6000,
    NULL,
    12.00,
    true
  );


-- ── 2. Movimientos de Julio 2026 — Brenntag Chile SpA ────────────────────────
-- Se generan ingresos y despachos distribuidos en el mes
-- para que la tabla diaria HES tenga variación real

INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, unidades, operador, estado, fecha)
VALUES
  -- Semana 1
  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 2, 'David Silva', 'completado',
   '2026-07-01 09:15:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 4, 'David Silva', 'completado',
   '2026-07-02 10:30:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Isotanque T11 — Hidróxido de Sodio 30%', 'Zona Isotanques', 1, 'David Silva', 'completado',
   '2026-07-03 08:45:00+00'),

  ('despacho', 'Transporte',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-04 14:00:00+00'),

  -- Semana 2
  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 6, 'David Silva', 'completado',
   '2026-07-07 09:00:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-08 11:15:00+00'),

  ('despacho', 'Logística',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 3, 'David Silva', 'completado',
   '2026-07-10 15:30:00+00'),

  -- Semana 3
  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 5, 'David Silva', 'completado',
   '2026-07-14 08:30:00+00'),

  ('despacho', 'Transporte',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Isotanque T11 — Hidróxido de Sodio 30%', 'Zona Isotanques', 1, 'David Silva', 'completado',
   '2026-07-15 13:00:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 2, 'David Silva', 'completado',
   '2026-07-17 10:00:00+00'),

  -- Semana 4
  ('despacho', 'Transporte',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-21 09:30:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 3, 'David Silva', 'completado',
   '2026-07-23 11:00:00+00'),

  ('despacho', 'Logística',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL', 4, 'David Silva', 'completado',
   '2026-07-25 14:30:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Isotanque T11 — Hidróxido de Sodio 30%', 'Zona Isotanques', 2, 'David Silva', 'completado',
   '2026-07-28 09:15:00+00'),

  ('despacho', 'Transporte',
   (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-30 16:00:00+00');


-- ── 3. Movimientos de Julio 2026 — BASF Chile Ltda. ──────────────────────────

INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, unidades, operador, estado, fecha)
VALUES
  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',
   'Contenedor 40ft — Resinas Epóxicas', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-02 08:00:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',
   'Pallets RESPEL — Solventes usados Cl. 3', 'Zona RESPEL', 6, 'David Silva', 'completado',
   '2026-07-05 10:00:00+00'),

  ('despacho', 'Logística',
   (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',
   'Pallets RESPEL — Solventes usados Cl. 3', 'Zona RESPEL', 3, 'David Silva', 'completado',
   '2026-07-11 13:30:00+00'),

  ('ingreso',  'Almacenaje',
   (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',
   'Pallets RESPEL — Solventes usados Cl. 3', 'Zona RESPEL', 4, 'David Silva', 'completado',
   '2026-07-18 09:00:00+00'),

  ('despacho', 'Transporte',
   (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',
   'Contenedor 40ft — Resinas Epóxicas', 'Bodega IMO', 1, 'David Silva', 'completado',
   '2026-07-24 11:00:00+00');
