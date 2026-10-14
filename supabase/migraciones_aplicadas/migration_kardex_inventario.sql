-- Vista Kardex de inventario (piloto ENAP): campos de manifiesto que faltaban
-- en movimientos (guía de despacho y orden de compra, distintos del N° de
-- report ADP) + flag por cliente para activar la vista Kardex.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS guia_numero TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS orden_compra TEXT;
-- Texto libre (no FK): el excel de origen mezcla códigos reales de
-- instalación con siglas de contenedores/isotanques en tránsito que no
-- existen como instalación catalogada — forzar una FK dejaría casi todo null.
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS bodega TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS usa_vista_kardex BOOLEAN NOT NULL DEFAULT false;

-- El check original de tipo_envase se quedó corto frente a envases reales
-- del Kardex ENAP (maxisacos, tinetas, cilindros, cuñetes) — se amplía.
ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_tipo_envase_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_envase_check
  CHECK (tipo_envase IS NULL OR tipo_envase IN ('Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Maxisaco','Tineta','Cilindro','Cuñete','Otro'));
