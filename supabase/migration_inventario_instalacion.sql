-- Migración: enlaza cada ítem de inventario a una instalación física
-- (bodega/patio) y agrega un peso estimado por ítem, para poder medir
-- ocupación real por instalación. La conversión exacta "ítem -> toneladas"
-- según su tipo de almacenaje se define más adelante con datos reales —
-- por ahora el campo es opcional y parte en null/0 para no bloquear nada.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE inventario_items
  ADD COLUMN IF NOT EXISTS instalacion_id UUID REFERENCES instalaciones_almacenamiento(id) ON DELETE SET NULL;
ALTER TABLE inventario_items
  ADD COLUMN IF NOT EXISTS peso_ton NUMERIC(10, 3);

CREATE INDEX IF NOT EXISTS idx_inventario_instalacion ON inventario_items(instalacion_id);

-- Capacidad en toneladas como número (además del texto libre "capacidad")
-- para poder sumar/comparar ocupación sin parsear texto. Null si la unidad
-- declarada no es directamente comparable en toneladas (ej. 170 m2).
ALTER TABLE instalaciones_almacenamiento
  ADD COLUMN IF NOT EXISTS capacidad_ton NUMERIC(10, 2);

UPDATE instalaciones_almacenamiento SET capacidad_ton = 700  WHERE codigo = '106-1';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 100  WHERE codigo = '106-2A';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 100  WHERE codigo = '106-2B';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 550  WHERE codigo = '106-3';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 1700 WHERE codigo = '106-6A';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 300  WHERE codigo = '106-6B';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 800  WHERE codigo = 'Patio de almacenamiento N°1';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 800  WHERE codigo = 'Patio de almacenamiento N°2';
UPDATE instalaciones_almacenamiento SET capacidad_ton = 30   WHERE codigo = '22-4';
-- 22-2 / 22-3 queda en null — su capacidad está en m2, no en toneladas.
