-- ═══════════════════════════════════════════════════
-- CLEANUP DEMO DATA — ADP Gestión · Altos del Puerto
-- Ejecutar en Supabase SQL Editor para revertir demo_data.sql
-- ═══════════════════════════════════════════════════

-- El orden importa: primero las tablas que referencian clientes

-- ── 1. Movimientos de los clientes demo ──────────────
DELETE FROM movimientos
WHERE cliente_nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');

-- ── 2. Inventario de los clientes demo ───────────────
DELETE FROM inventario_items
WHERE cliente_id IN (
  SELECT id FROM clientes
  WHERE nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.')
);

-- ── 3. Reports/HIS de los clientes demo ──────────────
DELETE FROM reports
WHERE cliente IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');

-- ── 4. Clientes demo ─────────────────────────────────
DELETE FROM clientes
WHERE nombre IN ('Brenntag Chile SpA', 'BASF Chile Ltda.', 'Air Liquide Chile S.A.');
