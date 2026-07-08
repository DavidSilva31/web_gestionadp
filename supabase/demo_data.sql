-- ═══════════════════════════════════════════════════
-- DEMO DATA — ADP Gestión · Altos del Puerto
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- ── 1. Clientes ──────────────────────────────────────
INSERT INTO clientes (nombre, rut, contacto, email, sector, activo)
VALUES
  ('Brenntag Chile SpA',     '76.184.923-1', 'Carlos Vega',     'cvega@brenntag.cl',        'Químicos',             true),
  ('BASF Chile Ltda.',       '78.531.204-9', 'Ana Rodríguez',   'arodriguez@basf.com',      'Químicos industriales',true),
  ('Air Liquide Chile S.A.', '79.642.315-K', 'Roberto Fuentes', 'rfuentes@airliquide.com',  'Gases industriales',   true);

-- ── 2. Inventario ────────────────────────────────────
INSERT INTO inventario_items (cliente_id, descripcion, categoria, area, clase_imo, nu, unidad, stock_actual, stock_minimo, activo)
VALUES
  -- Brenntag
  ((SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Contenedor IMO 20ft — Ácido Clorhídrico 33%',  'Contenedor IMO',    'Bodega IMO',       '8',   '1789', 'contenedor', 3, 1, true),
  ((SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Isotanque T11 — Hidróxido de Sodio 30%',        'Isotanque',         'Zona Isotanques',  '8',   '1824', 'unidad',     2, 1, true),
  ((SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Pallets RESPEL — Envases contaminados Cl. 8',   'Residuo peligroso', 'Zona RESPEL',      '8',   '3077', 'pallet',     6, 3, true),

  -- BASF
  ((SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'Contenedor 40ft — Resinas Epóxicas',            'Contenedor IMO',    'Bodega IMO',       '3',   '1267', 'contenedor', 1, 1, true),
  ((SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'Pallets RESPEL — Solventes usados Cl. 3',       'Residuo peligroso', 'Zona RESPEL',      '3',   '1993', 'pallet',     8, 5, true),

  -- Air Liquide
  ((SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
   'Isotanque T75 — Nitrógeno Líquido',             'Isotanque',         'Zona Isotanques',  '2.2', '1977', 'unidad',     4, 2, true),
  ((SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
   'Contenedor 20ft — Argón Comprimido',            'Contenedor IMO',    'Bodega IMO',       '2.2', '1006', 'contenedor', 2, 1, true);

-- ── 3. Movimientos ───────────────────────────────────
INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, unidades, operador, estado, fecha)
VALUES
  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',    'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO',      1, 'David Silva',   'completado', NOW() - INTERVAL '18 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',    'Isotanque T11 — Hidróxido de Sodio 30%',      'Zona Isotanques', 1, 'David Silva',   'completado', NOW() - INTERVAL '15 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
   'Air Liquide Chile S.A.','Isotanque T75 — Nitrógeno Líquido',           'Zona Isotanques', 2, 'David Silva',   'completado', NOW() - INTERVAL '12 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',      'Contenedor 40ft — Resinas Epóxicas',          'Bodega IMO',      1, 'David Silva',   'completado', NOW() - INTERVAL '10 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',      'Pallets RESPEL — Solventes usados Cl. 3',     'Zona RESPEL',     4, 'David Silva',   'completado', NOW() - INTERVAL '8 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
   'Air Liquide Chile S.A.','Contenedor 20ft — Argón Comprimido',          'Bodega IMO',      2, 'David Silva',   'completado', NOW() - INTERVAL '6 days'),

  ('despacho', 'Transporte', (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',    'Contenedor IMO 20ft — Ácido Clorhídrico 33%', 'Bodega IMO',      1, 'David Silva',   'completado', NOW() - INTERVAL '5 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Brenntag Chile SpA' LIMIT 1),
   'Brenntag Chile SpA',    'Pallets RESPEL — Envases contaminados Cl. 8', 'Zona RESPEL',     3, 'David Silva',   'completado', NOW() - INTERVAL '4 days'),

  ('despacho', 'Logística',  (SELECT id FROM clientes WHERE nombre = 'BASF Chile Ltda.' LIMIT 1),
   'BASF Chile Ltda.',      'Pallets RESPEL — Solventes usados Cl. 3',     'Zona RESPEL',     2, 'David Silva',   'completado', NOW() - INTERVAL '3 days'),

  ('ingreso',  'Almacenaje', (SELECT id FROM clientes WHERE nombre = 'Air Liquide Chile S.A.' LIMIT 1),
   'Air Liquide Chile S.A.','Isotanque T75 — Nitrógeno Líquido',           'Zona Isotanques', 2, 'David Silva',   'en_proceso', NOW() - INTERVAL '1 day');

-- ── 4. Reports (HIS) ─────────────────────────────────
INSERT INTO reports (
  estado, cliente, fecha, patente, conductor, rut_conductor, empresa_transporte,
  hds_header,
  sec1_activa, sec1_tipo_movimiento, sec1_tipo_contenedor,
  sec1_carga_normal, sec1_carga_imo, sec1_hds,
  sec1_clase_imo, sec1_nu, sec1_hora_inicio, sec1_hora_termino,
  sec1_sigla, sec1_guia_numero,
  sec2_activa, sec3_activa,
  nombre_operador
)
VALUES
  ('despachado', 'Brenntag Chile SpA', (NOW() - INTERVAL '14 days')::date,
   'BCHK-21', 'Luis Morales', '12.456.789-0', 'Transportes IMO Sur Ltda.',
   true,
   true, 'ingreso', '20ft', false, true, true,
   '8', '1789', '09:00', '11:30',
   'BRE-001', 'GD-2026-0441',
   false, false,
   'David Silva'),

  ('despachado', 'Air Liquide Chile S.A.', (NOW() - INTERVAL '11 days')::date,
   'FKRP-32', 'Marcelo Torres', '13.567.890-1', 'Transgas Ltda.',
   false,
   true, 'ingreso', 'isotanque', false, true, false,
   '2.2', '1977', '08:30', '10:00',
   'AIR-001', 'GD-2026-0455',
   false, false,
   'David Silva'),

  ('despachado', 'BASF Chile Ltda.', (NOW() - INTERVAL '9 days')::date,
   'PLMV-44', 'Rodrigo Sáez', '14.678.901-2', 'Logística Química SpA',
   true,
   true, 'ingreso', '40ft', false, true, true,
   '3', '1267', '10:15', '13:00',
   'BAS-001', 'GD-2026-0467',
   false, false,
   'David Silva'),

  ('pendiente_despacho', 'Brenntag Chile SpA', (NOW() - INTERVAL '3 days')::date,
   'GKRT-55', 'Héctor Muñoz', '15.789.012-3', 'Transportes IMO Sur Ltda.',
   true,
   true, 'despacho', '20ft', false, true, true,
   '8', '1789', '14:00', '15:30',
   'BRE-002', 'GD-2026-0489',
   false, false,
   'David Silva'),

  ('borrador', 'Air Liquide Chile S.A.', CURRENT_DATE,
   '', '', null, null,
   false,
   true, 'ingreso', 'isotanque', false, true, false,
   '2.2', '1977', null, null,
   null, null,
   false, false,
   'David Silva');
