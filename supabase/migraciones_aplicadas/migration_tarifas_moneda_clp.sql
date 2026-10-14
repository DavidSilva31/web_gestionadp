-- Migración: soporte de tarifas en pesos (CLP) además de UF.
-- BASF factura en $ fijos (no indexados a UF) y el arriendo de bodega de
-- Danilo Jordan también trae un ítem en $ (Arriendo Apilador). El resto del
-- sistema sigue asumiendo UF por defecto — moneda='UF' es el default y no
-- cambia nada para los clientes existentes.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE tarifas_cliente ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'UF';
ALTER TABLE tarifas_cliente DROP CONSTRAINT IF EXISTS tarifas_cliente_moneda_check;
ALTER TABLE tarifas_cliente ADD CONSTRAINT tarifas_cliente_moneda_check CHECK (moneda IN ('UF', 'CLP'));
ALTER TABLE tarifas_cliente ADD COLUMN IF NOT EXISTS tarifa_almacenaje_clp NUMERIC(12, 2);
ALTER TABLE tarifas_cliente ADD COLUMN IF NOT EXISTS tarifa_inout_clp       NUMERIC(12, 2);

ALTER TABLE servicios_cliente ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'UF';
ALTER TABLE servicios_cliente DROP CONSTRAINT IF EXISTS servicios_cliente_moneda_check;
ALTER TABLE servicios_cliente ADD CONSTRAINT servicios_cliente_moneda_check CHECK (moneda IN ('UF', 'CLP'));
ALTER TABLE servicios_cliente ADD COLUMN IF NOT EXISTS tarifa_clp NUMERIC(12, 2);
