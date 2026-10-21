-- Tarifado Transporte: casillas resaltadas por tarifa, para que el cliente ubique rápido su
-- tarifa en el PDF. Guarda los índices (0 a 6) de los tramos de diésel resaltados en cada línea.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
ALTER TABLE tarifado_lineas ADD COLUMN IF NOT EXISTS resaltados INTEGER[] NOT NULL DEFAULT '{}';
