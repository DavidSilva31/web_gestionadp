-- ═══════════════════════════════════════════════════
-- CLEANUP DEMO DATA — ADP Gestión · Altos del Puerto
-- Ejecutar en Supabase SQL Editor para revertir demo_data.sql
-- ═══════════════════════════════════════════════════

-- El orden importa: primero las tablas que referencian a los clientes demo

-- ── 1. Audit logs de los reports demo ────────────────
DELETE FROM audit_logs
WHERE registro_id IN (
  SELECT id FROM reports
  WHERE cliente IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.')
);

-- ── 2. Movimientos de los clientes demo ──────────────
DELETE FROM movimientos
WHERE cliente_nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');

-- ── 3. Inventario de los clientes demo ───────────────
DELETE FROM inventario_items
WHERE cliente_id IN (
  SELECT id FROM clientes
  WHERE nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.')
);

-- ── 4. Tarifas de los clientes demo (demo_data_hes.sql) ──
DELETE FROM tarifas_cliente
WHERE cliente_id IN (
  SELECT id FROM clientes
  WHERE nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.')
);

-- ── 5. Reports de los clientes demo ──────────────────
DELETE FROM reports
WHERE cliente IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');

-- ── 6. Clientes demo ─────────────────────────────────
DELETE FROM clientes
WHERE nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');
