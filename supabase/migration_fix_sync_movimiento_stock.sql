-- Bug preexistente: sync_inventario_from_movimiento() (trigger sobre
-- movimientos, distinto de sync_inventario_stock() que corre sobre reports)
-- nunca se actualizó cuando se separó stock_actual (posiciones) de
-- stock_unidades (unidades) — sigue moviendo TODO el delta de "unidades"
-- hacia stock_actual y nunca toca stock_unidades. Cualquier movimiento
-- insertado con inventario_item_id (manual o importado, no generado por un
-- report) deja el stock de ese ítem mal.
--
-- Esta migración:
-- 1) Corrige la función para que posiciones -> stock_actual y
--    unidades -> stock_unidades (mismo patrón que ya usa sync_inventario_stock()
--    para reports desde migration_reports_sec3_unidades.sql).
-- 2) Recalcula stock_actual/stock_unidades de todos los ítems de ENAP desde
--    cero, sumando el neto (ingreso suma, despacho resta) de sus
--    movimientos con inventario_item_id, más el neto de cualquier report
--    despachado con Bodegaje activo sobre ese ítem (que mueve stock por un
--    camino distinto, sync_inventario_stock() sobre reports, y no debe
--    perderse en el recálculo).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION sync_inventario_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_delta_pos     INTEGER;
  v_delta_und     INTEGER;
  v_old_delta_pos INTEGER;
  v_old_delta_und INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.inventario_item_id IS NOT NULL THEN
      v_old_delta_pos := COALESCE(OLD.posiciones, 1);
      v_old_delta_und := COALESCE(OLD.unidades, 0);
      IF OLD.tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_old_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_old_delta_und)
          WHERE id = OLD.inventario_item_id;
      ELSIF OLD.tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_old_delta_pos,
          stock_unidades = stock_unidades + v_old_delta_und
          WHERE id = OLD.inventario_item_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.inventario_item_id IS NOT NULL THEN
      v_delta_pos := COALESCE(NEW.posiciones, 1);
      v_delta_und := COALESCE(NEW.unidades, 0);
      IF NEW.tipo = 'ingreso' THEN
        UPDATE inventario_items SET
          stock_actual   = stock_actual + v_delta_pos,
          stock_unidades = stock_unidades + v_delta_und
          WHERE id = NEW.inventario_item_id;
      ELSIF NEW.tipo = 'despacho' THEN
        UPDATE inventario_items SET
          stock_actual   = GREATEST(0, stock_actual - v_delta_pos),
          stock_unidades = GREATEST(0, stock_unidades - v_delta_und)
          WHERE id = NEW.inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── Recálculo de stock para ENAP ────────────────────────────────────────
ALTER TABLE inventario_items DISABLE TRIGGER inventario_items_protege_stock;

WITH cliente_enap AS (
  SELECT id FROM clientes WHERE nombre ILIKE '%ENAP%' LIMIT 1
),
mov_netos AS (
  SELECT
    m.inventario_item_id AS item_id,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN COALESCE(m.posiciones, 1) ELSE -COALESCE(m.posiciones, 1) END) AS net_pos,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN COALESCE(m.unidades, 0) ELSE -COALESCE(m.unidades, 0) END) AS net_und
  FROM movimientos m
  WHERE m.inventario_item_id IS NOT NULL
    AND m.cliente_id = (SELECT id FROM cliente_enap)
  GROUP BY m.inventario_item_id
),
report_netos AS (
  SELECT
    r.sec3_inventario_item_id AS item_id,
    SUM(CASE WHEN r.sec3_tipo = 'ingreso' THEN COALESCE(r.sec3_numero_pallets, 1) ELSE -COALESCE(r.sec3_numero_pallets, 1) END) AS net_pos,
    SUM(CASE WHEN r.sec3_tipo = 'ingreso' THEN COALESCE(r.sec3_numero_unidades, 0) ELSE -COALESCE(r.sec3_numero_unidades, 0) END) AS net_und
  FROM reports r
  JOIN inventario_items ii2 ON ii2.id = r.sec3_inventario_item_id
  WHERE r.estado = 'despachado' AND r.sec3_activa AND ii2.cliente_id = (SELECT id FROM cliente_enap)
  GROUP BY r.sec3_inventario_item_id
)
UPDATE inventario_items ii
SET
  stock_actual   = GREATEST(0, COALESCE(mn.net_pos, 0) + COALESCE(rn.net_pos, 0)),
  stock_unidades = GREATEST(0, COALESCE(mn.net_und, 0) + COALESCE(rn.net_und, 0)),
  updated_at     = NOW()
FROM (SELECT id FROM inventario_items WHERE cliente_id = (SELECT id FROM cliente_enap)) target
LEFT JOIN mov_netos mn ON mn.item_id = target.id
LEFT JOIN report_netos rn ON rn.item_id = target.id
WHERE ii.id = target.id
  AND (mn.item_id IS NOT NULL OR rn.item_id IS NOT NULL);

ALTER TABLE inventario_items ENABLE TRIGGER inventario_items_protege_stock;
