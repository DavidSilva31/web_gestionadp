-- Código / SKU del producto en el ítem de inventario. Hasta ahora solo vivía
-- en movimientos.codigo, así que un ítem sin movimientos no tenía código.
-- Nullable: los ítems existentes se completan después (ver carga desde Excel).
-- Índice no único: dos ítems de un mismo cliente pueden compartir SKU en datos
-- históricos.

ALTER TABLE inventario_items ADD COLUMN IF NOT EXISTS codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_inventario_codigo ON inventario_items(cliente_id, codigo);
