-- HELSON MUÑOZ: el REFRIGERANTE R134A (report #71) y el R507A (report #127) quedaron
-- en un solo producto, con un solo SKU en el ítem. Se separan en dos productos, uno
-- por SKU, con el formato "NOMBRE (SKU)" del resto del catálogo:
--   REFRIGERANTE (R134A)  35 pos / 1550 und  (report #71, lote R134, ONU 3159)
--   REFRIGERANTE (R507A)   1 pos /   45 und  (report #127, lote R507, ONU 1078)
--
-- Causa: en el report #127 se usó "Nuevo producto" con el nombre REFRIGERANTE y SKU
-- R507A. El producto existente no tenía SKU propio (el R134A vivía solo en su
-- movimiento), así que el alta rápida lo tomó por el mismo producto y le escribió el
-- SKU nuevo. Ya está corregido en item-form-dialog.tsx (ahora mira también los SKU de
-- los movimientos del ítem antes de reutilizarlo).
--
-- Cómo mueve el stock sin tocarlo a mano: al cambiar el ítem de la línea del report
-- #127, el trigger de resync de Bodegaje recalcula ese report (revierte el ingreso
-- sobre el ítem viejo y lo vuelve a crear sobre el nuevo), así que el stock de cada
-- producto queda calculado por el propio sistema. El texto del producto en los
-- reports #71 y #127 no se modifica.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

DO $$
DECLARE
  v_rep127  UUID;
  v_cli     UUID;
  v_a       UUID;  -- ítem actual "REFRIGERANTE" -> pasa a ser R134A
  v_b       UUID;  -- ítem nuevo R507A
BEGIN
  SELECT id INTO v_rep127 FROM reports WHERE numero = 127;
  SELECT id INTO v_cli FROM clientes WHERE nombre = (SELECT cliente FROM reports WHERE numero = 127);
  SELECT id INTO v_a FROM inventario_items WHERE cliente_id = v_cli AND descripcion = 'REFRIGERANTE';
  IF v_a IS NULL THEN RAISE EXCEPTION 'No se encontró el ítem REFRIGERANTE de HELSON'; END IF;

  -- 1) El ítem existente queda como R134A.
  UPDATE inventario_items
     SET descripcion = 'REFRIGERANTE (R134A)', codigo = 'R134A', clase_imo = '2.2', nu = '3159'
   WHERE id = v_a;

  -- 2) Ítem nuevo para R507A (mismos datos de catálogo que el otro).
  INSERT INTO inventario_items (cliente_id, descripcion, codigo, categoria, area, clase_imo, nu, unidad, stock_actual, stock_unidades, activo)
  SELECT cliente_id, 'REFRIGERANTE (R507A)', 'R507A', categoria, area, '2.2', '1078', unidad, 0, 0, TRUE
    FROM inventario_items WHERE id = v_a
  RETURNING id INTO v_b;

  -- 3) La línea del report #127 pasa al ítem nuevo; el resync recalcula movimiento y stock.
  --    (el candado de "report despachado" se levanta un instante: en el SQL Editor
  --    auth.uid() es NULL y no pasa el bypass de editor total)
  ALTER TABLE report_bodegaje_items DISABLE TRIGGER report_bodegaje_items_lock;
  UPDATE report_bodegaje_items
     SET sec3_inventario_item_id = v_b
   WHERE report_id = v_rep127 AND sec3_inventario_item_id = v_a;
  ALTER TABLE report_bodegaje_items ENABLE TRIGGER report_bodegaje_items_lock;

  -- 4) El movimiento del report #71 pasa a llamarse como su ítem (Detalle agrupa por `carga`).
  UPDATE movimientos SET carga = 'REFRIGERANTE (R134A)' WHERE inventario_item_id = v_a;
END $$;
