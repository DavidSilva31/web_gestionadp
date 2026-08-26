-- Firma del conductor en tablet/lápiz óptico — se dibuja en un canvas en el
-- report y se guarda como imagen PNG en el mismo bucket privado
-- "reports-firmados" que ya usan los HDS y la evidencia fotográfica.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS firma_conductor_url TEXT;
