-- Inventario en solo lectura para usuarios puntuales (hoy: Jocelyn Olivares).
--
-- Un usuario con profiles.inventario_solo_lectura = true puede ENTRAR al módulo
-- Inventario (ver Resumen y Detalle/Kardex, filtrar, exportar) pero no puede
-- crear, editar ni desactivar productos: lo bloquea la base de datos, no solo la
-- pantalla.
--
-- Cómo se bloquea (misma técnica que guard_inventario_items_stock_directo):
-- un trigger sobre inventario_items rechaza el INSERT/UPDATE/DELETE cuando es
-- DIRECTO del usuario (pg_trigger_depth() <= 1, medido dentro del propio
-- trigger). Lo que dispara el sistema por debajo —despachar un report, que crea
-- movimientos y mueve stock desde otros triggers (profundidad 2)— sigue
-- funcionando, porque ese usuario necesita seguir despachando reports. Única
-- excepción: la actualización de peso_ton, que la pantalla de reports sincroniza
-- sola al guardar.
--
-- LÍMITE (a propósito): la tabla `movimientos` NO se bloquea acá. Las ediciones
-- del Kardex (celdas, ajustes de stock, borrar movimientos) escriben en esa
-- tabla, pero el módulo Movimientos —al que este usuario también accede— escribe
-- en la misma, y la base no puede distinguir desde qué pantalla viene el cambio.
-- Esas ediciones quedan ocultas en la pantalla de Inventario para este usuario,
-- pero no bloqueadas en la base de datos.
--
-- La marca profiles.inventario_solo_lectura queda protegida como role/permisos:
-- el propio usuario no puede quitársela editando su perfil.
--
-- Además agrega "/inventario" a los accesos de Jocelyn (hoy no lo tenía).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inventario_solo_lectura BOOLEAN NOT NULL DEFAULT FALSE;

-- 1) La marca no puede cambiarla el propio usuario (igual que role/permisos).
CREATE OR REPLACE FUNCTION protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.role                   := OLD.role;
    NEW.activo                 := OLD.activo;
    NEW.permisos               := OLD.permisos;
    NEW.must_change_password   := OLD.must_change_password;
    NEW.inventario_solo_lectura := OLD.inventario_solo_lectura;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2) ¿El usuario actual tiene el Inventario en solo lectura?
CREATE OR REPLACE FUNCTION es_inventario_solo_lectura()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT inventario_solo_lectura FROM profiles WHERE id = auth.uid()), FALSE)
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3) Bloqueo de escrituras directas sobre inventario_items.
CREATE OR REPLACE FUNCTION guard_inventario_items_solo_lectura()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() <= 1 AND es_inventario_solo_lectura() THEN
    -- peso_ton se sincroniza solo al guardar un report: no cuenta como edición.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'peso_ton' - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'peso_ton' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Tu usuario tiene el Inventario en solo lectura: no puede crear, editar ni desactivar productos';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS inventario_items_solo_lectura ON inventario_items;
CREATE TRIGGER inventario_items_solo_lectura
  BEFORE INSERT OR UPDATE OR DELETE ON inventario_items
  FOR EACH ROW EXECUTE FUNCTION guard_inventario_items_solo_lectura();

-- 4) Jocelyn: acceso a Inventario, en solo lectura.
UPDATE profiles SET
  inventario_solo_lectura = TRUE,
  permisos = CASE
    WHEN permisos IS NULL OR '/inventario' = ANY(permisos) THEN permisos
    ELSE array_append(permisos, '/inventario')
  END
WHERE email = 'jocelynolivares@altosdelpuerto.cl';
