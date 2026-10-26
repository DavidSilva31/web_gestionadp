-- UTI Chile: cada pallet cuenta UNA posición, en la clase más cara que contiene (así se factura).
--
-- La carga inicial dejó la posición de cada pallet en su PRIMERA línea; en los pallets que mezclan
-- clases (13) eso podía facturarlos en una clase más barata. Se mueve la posición a la línea de la
-- clase con la tarifa de almacenaje más alta (empate: la línea más antigua).
-- Tarifas de UTI (UF por pallet-día): IMO 2.1 = 0,029 · IMO 3 y 5 = 0,022 · IMO 8 = 0,011 ·
-- IMO 9 = 0,010 · carga normal = 0,007.
--
-- 1) Función uti_tarifa_clase(imo): la tarifa de esa clase. Si cambian las tarifas de UTI, hay que
--    actualizarla (la usan esta corrección y el cálculo automático de posiciones de los reports).
-- 2) Corrige las posiciones de la carga inicial: 10 pallets cambian de línea; el total sigue en 435.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Va en una transacción: si la verificación
-- final falla, se deshace todo.

BEGIN;

CREATE OR REPLACE FUNCTION uti_tarifa_clase(p_imo TEXT)
RETURNS NUMERIC AS $$
  SELECT CASE
    WHEN btrim(COALESCE(p_imo, '')) ~ '^2\.1' THEN 0.029
    WHEN btrim(COALESCE(p_imo, '')) ~ '^(3|5)' THEN 0.022
    WHEN btrim(COALESCE(p_imo, '')) ~ '^9'     THEN 0.010
    WHEN btrim(COALESCE(p_imo, '')) ~ '^8'     THEN 0.011
    ELSE 0.007
  END
$$ LANGUAGE sql IMMUTABLE;

-- Mover posiciones sin que el trigger de stock las recalcule línea a línea (el stock de cada producto se
-- recalcula al final desde sus movimientos).
ALTER TABLE movimientos      DISABLE TRIGGER movimientos_sync_inventario;
ALTER TABLE inventario_items DISABLE TRIGGER inventario_items_protege_stock;

WITH portadores AS (
  SELECT DISTINCT ON (numero_pallet) id
  FROM movimientos
  WHERE cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039'
    AND tipo = 'ingreso' AND numero_pallet IS NOT NULL
  ORDER BY numero_pallet, uti_tarifa_clase(imo) DESC, numero ASC
)
UPDATE movimientos m
   SET posiciones = CASE WHEN m.id IN (SELECT id FROM portadores) THEN 1 ELSE 0 END
 WHERE m.cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039'
   AND m.tipo = 'ingreso' AND m.numero_pallet IS NOT NULL
   AND m.posiciones IS DISTINCT FROM (CASE WHEN m.id IN (SELECT id FROM portadores) THEN 1 ELSE 0 END);

UPDATE inventario_items i
   SET stock_actual = COALESCE((
         SELECT SUM(CASE WHEN m.tipo = 'ingreso' THEN m.posiciones ELSE -m.posiciones END)
           FROM movimientos m WHERE m.inventario_item_id = i.id), 0)
 WHERE i.cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039';

ALTER TABLE inventario_items ENABLE TRIGGER inventario_items_protege_stock;
ALTER TABLE movimientos      ENABLE TRIGGER movimientos_sync_inventario;

-- Verificación: 435 posiciones, una por pallet, con esta distribución por clase
DO $$
DECLARE v_total INT; v_pallets INT; v_malos INT; v_dist TEXT;
BEGIN
  SELECT COALESCE(SUM(posiciones), 0), COUNT(DISTINCT numero_pallet) INTO v_total, v_pallets
    FROM movimientos WHERE cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039' AND tipo = 'ingreso';
  SELECT COUNT(*) INTO v_malos FROM (
    SELECT numero_pallet FROM movimientos
     WHERE cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039' AND tipo = 'ingreso' AND numero_pallet IS NOT NULL
     GROUP BY numero_pallet HAVING SUM(posiciones) <> 1) t;
  SELECT string_agg(imo || ':' || n, ' ' ORDER BY imo) INTO v_dist FROM (
    SELECT imo, SUM(posiciones) AS n FROM movimientos
     WHERE cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039' AND tipo = 'ingreso' AND posiciones > 0
     GROUP BY imo) t;
  IF v_total <> 435 OR v_pallets <> 435 OR v_malos <> 0 OR v_dist IS DISTINCT FROM '2.1:1 3:5 5.1:12 8:108 NA:309' THEN
    RAISE EXCEPTION 'Verificación fallida: % posiciones, % pallets, % pallets sin exactamente 1 posición, distribución % (se esperaba 435, 435, 0 y 2.1:1 3:5 5.1:12 8:108 NA:309)',
      v_total, v_pallets, v_malos, v_dist;
  END IF;
END $$;

COMMIT;

-- Resultado (opcional): posiciones por clase
SELECT imo AS clase, SUM(posiciones) AS posiciones FROM movimientos
WHERE cliente_id = '2c1f77dd-944f-4e34-9d0a-b904da3a6039' AND tipo = 'ingreso' AND posiciones > 0
GROUP BY imo ORDER BY imo;
