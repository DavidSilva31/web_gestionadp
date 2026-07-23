-- ============================================================
-- ADP GESTIÓN — Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Roles de usuario ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('super_admin', 'operador', 'operador_carga');

-- ── Perfiles de usuario ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre                 TEXT NOT NULL,
  email                  TEXT NOT NULL,
  role                   user_role NOT NULL DEFAULT 'operador',
  activo                 BOOLEAN DEFAULT TRUE,
  permisos               TEXT[],
  must_change_password   BOOLEAN NOT NULL DEFAULT FALSE,
  notificaciones_activas BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_icon            TEXT,
  accent_color           TEXT NOT NULL DEFAULT 'celeste'
                           CHECK (accent_color IN ('celeste','verde','indigo','morado','rosa','naranja','teal')),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-crear perfil al registrar usuario en auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer su propio perfil
CREATE POLICY "Usuarios leen su propio perfil"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Cada usuario puede actualizar su propio perfil (nombre, preferencias).
-- Los campos sensibles (role/activo/permisos/must_change_password) quedan
-- protegidos por el trigger de abajo: si el cambio viene de una sesión
-- "authenticated" normal (no service_role), esos campos se revierten al
-- valor anterior sin importar qué mande el cliente.
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

-- Helper: rol del usuario actual — usado por las policies de abajo para
-- aplicar el sistema de roles a nivel de base de datos (no solo en el
-- frontend). SECURITY DEFINER + STABLE: se evalúa una vez por consulta.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;


-- ── Secuencia de numeración de reports ───────────────────────
-- En producción, ajustar al último número físico + 1:
--   ALTER SEQUENCE report_number_seq RESTART WITH 54801;
CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

-- ── Tabla principal de reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                INTEGER DEFAULT nextval('report_number_seq') UNIQUE NOT NULL,

  estado                TEXT NOT NULL DEFAULT 'pendiente_despacho'
                          CHECK (estado IN ('borrador', 'pendiente_despacho', 'despachado')),

  -- Antecedentes
  cliente               TEXT NOT NULL,
  fecha                 DATE NOT NULL DEFAULT CURRENT_DATE,
  patente               TEXT NOT NULL,
  conductor             TEXT NOT NULL,
  rut_conductor         TEXT,
  empresa_transporte    TEXT,
  transporte_tipo       TEXT NOT NULL DEFAULT 'externo' CHECK (transporte_tipo IN ('propio', 'externo')),
  hds_header            BOOLEAN DEFAULT FALSE,
  hds_archivos          TEXT[] NOT NULL DEFAULT '{}',

  -- Sección 1: Depósito de Contenedores
  sec1_activa           BOOLEAN DEFAULT FALSE,
  sec1_tipo_movimiento  TEXT CHECK (sec1_tipo_movimiento IN ('ingreso', 'despacho')),
  sec1_tipo_contenedor  TEXT CHECK (sec1_tipo_contenedor IN ('20ft', '40ft', 'isotanque')),
  sec1_carga_normal     BOOLEAN DEFAULT FALSE,
  sec1_carga_imo        BOOLEAN DEFAULT FALSE,
  sec1_clase_imo        TEXT,
  sec1_nu               TEXT,
  sec1_hora_inicio      TIME,
  sec1_hora_termino     TIME,
  sec1_sigla            TEXT,
  sec1_guia_numero      TEXT,
  sec1_interchange      TEXT,
  sec1_hds              BOOLEAN DEFAULT FALSE,

  -- Sección 2: Consolidado / Desconsolidado / Otros
  sec2_activa           BOOLEAN DEFAULT FALSE,
  sec2_consolidado      BOOLEAN DEFAULT FALSE,
  sec2_desconsolidado   BOOLEAN DEFAULT FALSE,
  sec2_picking          BOOLEAN DEFAULT FALSE,
  sec2_paletizado       BOOLEAN DEFAULT FALSE,
  sec2_etiquetado       BOOLEAN DEFAULT FALSE,
  sec2_otro             BOOLEAN DEFAULT FALSE,
  sec2_hora_inicio      TIME,
  sec2_hora_termino     TIME,
  sec2_sigla_numero     TEXT,
  sec2_observaciones    TEXT,

  -- Sección 3: Bodegaje
  sec3_activa           BOOLEAN DEFAULT FALSE,
  sec3_producto         TEXT,
  sec3_clase_imo        TEXT,
  sec3_hora_inicio      TIME,
  sec3_hora_termino     TIME,
  sec3_numero_bodega    TEXT,
  sec3_nu               TEXT,
  sec3_tipo             TEXT CHECK (sec3_tipo IN ('ingreso', 'despacho')),
  sec3_numero_pallets   INTEGER,
  sec3_numero_guia      TEXT,
  sec3_solicitado_por   TEXT CHECK (sec3_solicitado_por IN ('clientes', 'hds', 'operaciones', 'cuyd')),
  sec3_cuyd_detalle     TEXT,
  sec3_observaciones    TEXT,

  -- Firma 1: Operador de carga
  nombre_operador       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id),

  -- Firma 2: Despachador
  nombre_despachador    TEXT,
  fecha_despacho        TIMESTAMPTZ,
  dispatched_by         UUID REFERENCES auth.users(id),

  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_estado   ON reports(estado);
CREATE INDEX IF NOT EXISTS idx_reports_fecha    ON reports(fecha);
CREATE INDEX IF NOT EXISTS idx_reports_patente  ON reports(patente);
CREATE INDEX IF NOT EXISTS idx_reports_cliente  ON reports(cliente);
CREATE INDEX IF NOT EXISTS idx_reports_numero   ON reports(numero);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);

-- ── Auto-actualización de updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Tabla de clientes ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS cliente_number_seq START 1;

CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      INTEGER DEFAULT nextval('cliente_number_seq') UNIQUE NOT NULL,
  nombre      TEXT NOT NULL,
  rut         TEXT NOT NULL,
  contacto    TEXT,
  emails      TEXT[] NOT NULL DEFAULT '{}',
  sector      TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_rut    ON clientes(rut);

CREATE OR REPLACE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- SELECT abierto: operador_carga necesita listar clientes para elegir uno
-- al crear un report. Solo se restringe quién puede crear/editar clientes.
CREATE POLICY "Autenticados leen clientes"
  ON clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operador+ crean clientes"
  ON clientes FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

CREATE POLICY "Operador+ actualizan clientes"
  ON clientes FOR UPDATE TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'));

-- ── Tabla de auditoría ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla          TEXT NOT NULL,
  registro_id    TEXT NOT NULL,
  accion         TEXT NOT NULL,
  descripcion    TEXT,
  datos_prev     JSONB,
  datos_nuevo    JSONB,
  usuario_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nombre TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tabla_registro ON audit_logs(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at     ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario        ON audit_logs(usuario_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen audit_logs"
  ON audit_logs FOR SELECT TO authenticated USING (true);

-- No se puede insertar un log "a nombre de otro" — usuario_id debe ser el
-- del propio caller (o NULL, para acciones sin actor identificable).
CREATE POLICY "Autenticados insertan sus propios audit_logs"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() OR usuario_id IS NULL);

-- ── RLS Reports ───────────────────────────────────────────────
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen reports"
  ON reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados crean reports"
  ON reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan reports"
  ON reports FOR UPDATE TO authenticated USING (true);

-- Operador elimina solo sus propios reports; super_admin elimina cualquiera
CREATE POLICY "Eliminar reports"
  ON reports FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ── Tabla de inventario por cliente ───────────────────────────
CREATE SEQUENCE IF NOT EXISTS inventario_seq START 1;

CREATE TABLE IF NOT EXISTS inventario_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          INTEGER DEFAULT nextval('inventario_seq') UNIQUE NOT NULL,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  descripcion     TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('Contenedor IMO', 'Isotanque', 'Residuo peligroso', 'Carga general')),
  area            TEXT NOT NULL CHECK (area IN ('Bodega IMO', 'Zona Isotanques', 'Zona RESPEL', 'Bodega General')),
  clase_imo       TEXT,
  nu              TEXT,
  unidad          TEXT NOT NULL DEFAULT 'unidad',
  stock_actual    INTEGER NOT NULL DEFAULT 0,
  stock_minimo    INTEGER NOT NULL DEFAULT 0,
  observaciones   TEXT,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inventario_cliente ON inventario_items(cliente_id);
CREATE INDEX IF NOT EXISTS idx_inventario_activo  ON inventario_items(activo);
CREATE INDEX IF NOT EXISTS idx_inventario_area    ON inventario_items(area);

CREATE OR REPLACE TRIGGER inventario_updated_at
  BEFORE UPDATE ON inventario_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE inventario_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen inventario"
  ON inventario_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados crean inventario"
  ON inventario_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan inventario"
  ON inventario_items FOR UPDATE TO authenticated USING (true);

-- Solo super_admin puede borrar físicamente — la app siempre hace
-- soft-delete (activo=false) desde la UI normal.
CREATE POLICY "Solo super_admin elimina inventario físicamente"
  ON inventario_items FOR DELETE TO authenticated
  USING (current_user_role() = 'super_admin');

-- ── Vincular sec3 de reports con inventario ───────────────────
-- Permite que un report de bodegaje (sec3) actualice el stock de un ítem
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sec3_inventario_item_id UUID REFERENCES inventario_items(id) ON DELETE SET NULL;

-- ── Trigger: sincronizar stock desde reports ──────────────────
CREATE OR REPLACE FUNCTION sync_inventario_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_delta     INTEGER;
  v_old_delta INTEGER;
BEGIN
  -- Revertir el efecto del estado anterior (UPDATE o DELETE)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.sec3_activa, FALSE) AND OLD.sec3_inventario_item_id IS NOT NULL THEN
      v_old_delta := COALESCE(OLD.sec3_numero_pallets, 1);
      IF OLD.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items
          SET stock_actual = GREATEST(0, stock_actual - v_old_delta)
          WHERE id = OLD.sec3_inventario_item_id;
      ELSIF OLD.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items
          SET stock_actual = stock_actual + v_old_delta
          WHERE id = OLD.sec3_inventario_item_id;
      END IF;
    END IF;
  END IF;

  -- Aplicar el efecto del estado nuevo (INSERT o UPDATE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.sec3_activa, FALSE) AND NEW.sec3_inventario_item_id IS NOT NULL THEN
      v_delta := COALESCE(NEW.sec3_numero_pallets, 1);
      IF NEW.sec3_tipo = 'ingreso' THEN
        UPDATE inventario_items
          SET stock_actual = stock_actual + v_delta
          WHERE id = NEW.sec3_inventario_item_id;
      ELSIF NEW.sec3_tipo = 'despacho' THEN
        UPDATE inventario_items
          SET stock_actual = GREATEST(0, stock_actual - v_delta)
          WHERE id = NEW.sec3_inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER reports_sync_inventario
  AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_inventario_stock();

-- ── Tabla de movimientos ───────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS movimiento_seq START 1;

CREATE TABLE IF NOT EXISTS movimientos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              INTEGER DEFAULT nextval('movimiento_seq') UNIQUE NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('ingreso', 'despacho')),
  servicio            TEXT NOT NULL CHECK (servicio IN ('Almacenaje', 'Transporte', 'Porteo', 'Logística')),
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre      TEXT,
  carga               TEXT NOT NULL,
  area                TEXT CHECK (area IN ('Bodega IMO', 'Zona Isotanques', 'Zona RESPEL', 'Bodega General')),
  inventario_item_id  UUID REFERENCES inventario_items(id) ON DELETE SET NULL,
  unidades            INTEGER,
  operador            TEXT,
  estado              TEXT NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'completado')),
  observaciones       TEXT,
  -- Datos de manifiesto/lote (opcionales, capturados junto al movimiento)
  codigo              TEXT,
  imo                 TEXT,
  un                  TEXT,
  cas                 TEXT,
  lote                TEXT,
  fecha_elaboracion   DATE,
  fecha_vencimiento   DATE,
  peso_envase         NUMERIC,
  tipo_envase         TEXT CHECK (tipo_envase IS NULL OR tipo_envase IN ('Tambor','Bidón','IBC','Saco','Caja','Pallet','Granel','Otro')),
  posiciones          INTEGER,
  fecha               TIMESTAMPTZ DEFAULT NOW(),
  report_id           UUID REFERENCES reports(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_mov_fecha     ON movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_tipo      ON movimientos(tipo);
CREATE INDEX IF NOT EXISTS idx_mov_cliente   ON movimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mov_estado    ON movimientos(estado);
CREATE INDEX IF NOT EXISTS idx_mov_report    ON movimientos(report_id);

CREATE OR REPLACE TRIGGER movimientos_updated_at
  BEFORE UPDATE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen movimientos"
  ON movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean movimientos"
  ON movimientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados actualizan movimientos"
  ON movimientos FOR UPDATE TO authenticated USING (true);

-- ── Trigger: movimientos manuales con Almacenaje actualizan stock ──
-- (los auto-generados desde reports tienen report_id y no tienen
--  inventario_item_id para evitar doble conteo con el trigger de reports)
CREATE OR REPLACE FUNCTION sync_inventario_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_delta     INTEGER;
  v_old_delta INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.inventario_item_id IS NOT NULL THEN
      v_old_delta := COALESCE(OLD.unidades, 1);
      IF OLD.tipo = 'ingreso' THEN
        UPDATE inventario_items SET stock_actual = GREATEST(0, stock_actual - v_old_delta) WHERE id = OLD.inventario_item_id;
      ELSIF OLD.tipo = 'despacho' THEN
        UPDATE inventario_items SET stock_actual = stock_actual + v_old_delta WHERE id = OLD.inventario_item_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.inventario_item_id IS NOT NULL THEN
      v_delta := COALESCE(NEW.unidades, 1);
      IF NEW.tipo = 'ingreso' THEN
        UPDATE inventario_items SET stock_actual = stock_actual + v_delta WHERE id = NEW.inventario_item_id;
      ELSIF NEW.tipo = 'despacho' THEN
        UPDATE inventario_items SET stock_actual = GREATEST(0, stock_actual - v_delta) WHERE id = NEW.inventario_item_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER movimientos_sync_inventario
  AFTER INSERT OR UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION sync_inventario_from_movimiento();

-- ── Trigger: auto-crear movimiento cuando un report se despacha ──
CREATE OR REPLACE FUNCTION create_movimiento_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
BEGIN
  -- Solo cuando cambia a 'despachado'
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  -- Obtener cliente_id
  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  -- Determinar servicio y datos desde la sección activa más relevante
  IF NEW.sec3_activa THEN
    v_tipo     := COALESCE(NEW.sec3_tipo, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := COALESCE(NEW.sec3_producto, 'Bodegaje');
    v_area     := NULL;
  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    v_area     := NULL;
  ELSE
    v_tipo     := 'ingreso';
    v_servicio := 'Almacenaje';
    v_carga    := 'Sin descripción';
    v_area     := NULL;
  END IF;

  INSERT INTO movimientos (
    tipo, servicio, cliente_id, cliente_nombre, carga, area,
    unidades, operador, estado, fecha, report_id, created_by
  ) VALUES (
    v_tipo, v_servicio, v_cliente_id, NEW.cliente,
    v_carga, v_area,
    NEW.sec3_numero_pallets,
    COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
    'completado',
    COALESCE(NEW.fecha_despacho, NOW()),
    NEW.id,
    NEW.dispatched_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER reports_create_movimiento
  AFTER UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION create_movimiento_from_report();

-- ── Tarifas por cliente (HES) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tarifas_cliente (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cotizacion_numero     TEXT NOT NULL,
  clase_imo             TEXT,
  tarifa_almacenaje_uf  NUMERIC(10, 4),
  tarifa_inout_uf       NUMERIC(10, 4) DEFAULT 0.06,
  tarifa_descons_20_uf  NUMERIC(10, 4),
  tarifa_descons_40_uf  NUMERIC(10, 4),
  tarifa_consolid_40_uf NUMERIC(10, 4),
  tarifa_porteo_uf      NUMERIC(10, 4),
  tarifa_palletizado_uf NUMERIC(10, 4),
  facturacion_minima_uf NUMERIC(10, 2),
  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Secuencia para cotización número (COT-YYYY-NNN)
CREATE SEQUENCE IF NOT EXISTS cotizacion_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_cotizacion_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cotizacion_numero IS NULL OR NEW.cotizacion_numero = '' THEN
    NEW.cotizacion_numero := 'COT-' || EXTRACT(YEAR FROM NOW())::TEXT
                             || '-' || LPAD(nextval('cotizacion_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER set_cotizacion_numero
  BEFORE INSERT ON tarifas_cliente
  FOR EACH ROW EXECUTE FUNCTION generate_cotizacion_numero();

-- Precios — operador_carga no tiene /servicios ni /hes en sus rutas.
ALTER TABLE tarifas_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operador+ acceso completo tarifas_cliente"
  ON tarifas_cliente FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

-- ── Servicios adicionales por cliente (HES) ─────────────────────
CREATE TABLE IF NOT EXISTS servicios_cliente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  tarifa_uf   NUMERIC(10, 4),
  unidad      TEXT NOT NULL DEFAULT 'unidad',
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicios_cliente_cliente ON servicios_cliente(cliente_id);

ALTER TABLE servicios_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operador+ acceso completo servicios_cliente"
  ON servicios_cliente FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));

-- ── Caché de valores UF (HES) ──────────────────────────────────
-- La UF de una fecha pasada nunca cambia: una vez obtenida de una API
-- externa (mindicador.cl / gael.cloud) se guarda acá para no volver a
-- depender de ellas para esa misma fecha.
CREATE TABLE IF NOT EXISTS uf_valores (
  fecha      DATE PRIMARY KEY,
  valor      NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE uf_valores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operador+ acceso completo uf_valores"
  ON uf_valores FOR ALL TO authenticated
  USING (current_user_role() IN ('operador', 'super_admin'))
  WITH CHECK (current_user_role() IN ('operador', 'super_admin'));
