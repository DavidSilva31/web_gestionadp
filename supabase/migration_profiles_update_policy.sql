-- Migración: permite que cada usuario actualice su propio perfil
-- (nombre, preferencia de notificaciones). Antes no existía NINGUNA
-- policy de UPDATE en profiles, así que "Guardar cambios" en Mi Perfil
-- fallaba en silencio (Supabase no devuelve error cuando RLS bloquea
-- una fila, solo actualiza 0 filas).
--
-- Para evitar que un usuario normal se autoasigne role/activo/permisos
-- editando el payload del update, un trigger revierte esos campos a su
-- valor anterior cuando el cambio viene de una sesión "authenticated"
-- (no service_role) — los endpoints de administración usan la service
-- role key y no se ven afectados.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

CREATE POLICY "Usuarios actualizan su propio perfil"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.role                := OLD.role;
    NEW.activo               := OLD.activo;
    NEW.permisos             := OLD.permisos;
    NEW.must_change_password := OLD.must_change_password;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER protect_profile_privileged_fields_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileged_fields();
