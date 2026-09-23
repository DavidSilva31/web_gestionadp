-- Sección 3 (Bodegaje) pasa de UN producto por report a VARIOS — este
-- archivo crea report_bodegaje_items, reescribe los triggers que hoy leen
-- las columnas planas sec3_producto/sec3_numero_pallets/etc., agrega el
-- guardrail de inmutabilidad post-despacho, y hace el backfill de los
-- reports existentes. Las columnas sec3_* de producto en `reports` NO se
-- eliminan acá (quedan congeladas como respaldo/rollback) — se sacan en
-- una migración de limpieza posterior, una vez verificado en producción.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- ── 1) Tabla ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_bodegaje_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  orden                    INTEGER NOT NULL DEFAULT 0,

  sec3_inventario_item_id  UUID REFERENCES inventario_items(id) ON DELETE SET NULL,
  sec3_producto            TEXT,
  sec3_clase_imo           TEXT,
  sec3_nu                  TEXT,
  sec3_numero_bodega       TEXT,
  sec3_numero_pallets      INTEGER,
  sec3_numero_unidades     INTEGER,
  sec3_lote                TEXT,
  sec3_cas                 TEXT,
  sec3_orden_compra        TEXT,
  sec3_fecha_elaboracion   DATE,
  sec3_fecha_vencimiento   DATE,

  -- Tarifa/contrato derivada por línea de producto (no una sola por
  -- report) — cada producto puede tener una Clase IMO distinta.
  tarifa_cliente_id        UUID REFERENCES tarifas_cliente(id) ON DELETE SET NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bodegaje_items_report   ON report_bodegaje_items(report_id);
CREATE INDEX IF NOT EXISTS idx_bodegaje_items_inv_item ON report_bodegaje_items(sec3_inventario_item_id);
CREATE INDEX IF NOT EXISTS idx_bodegaje_items_tarifa   ON report_bodegaje_items(tarifa_cliente_id);

CREATE OR REPLACE TRIGGER report_bodegaje_items_updated_at
  BEFORE UPDATE ON report_bodegaje_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2) Backfill: un report_bodegaje_items por cada report existente con
-- Bodegaje activo (cualquier estado), para que la UI/PDF nuevos muestren
-- los reports viejos con su producto en la lista, no vacíos. Idempotente.
-- Va ACÁ, antes del trigger de inmutabilidad (más abajo) — si no, el propio
-- candado "ya despachado no se puede tocar" bloquearía este INSERT para
-- cualquier report que ya esté despachado. El DROP TRIGGER es defensivo
-- por si una corrida anterior de este mismo script ya alcanzó a crearlo
-- (ej. si falló más abajo y se está re-ejecutando completo).
DROP TRIGGER IF EXISTS report_bodegaje_items_lock ON report_bodegaje_items;

INSERT INTO report_bodegaje_items (
  report_id, orden, sec3_inventario_item_id, sec3_producto, sec3_clase_imo, sec3_nu,
  sec3_numero_bodega, sec3_numero_pallets, sec3_numero_unidades, sec3_lote, sec3_cas,
  sec3_orden_compra, sec3_fecha_elaboracion, sec3_fecha_vencimiento, tarifa_cliente_id
)
SELECT
  r.id, 0, r.sec3_inventario_item_id, r.sec3_producto, r.sec3_clase_imo, r.sec3_nu,
  r.sec3_numero_bodega, r.sec3_numero_pallets, r.sec3_numero_unidades, r.sec3_lote, r.sec3_cas,
  r.sec3_orden_compra, r.sec3_fecha_elaboracion, r.sec3_fecha_vencimiento, r.tarifa_cliente_id
FROM reports r
WHERE r.sec3_activa = TRUE
  AND NOT EXISTS (SELECT 1 FROM report_bodegaje_items i WHERE i.report_id = r.id);

-- ── 3) RLS — mismo patrón que reports (schema.sql): SELECT/INSERT/UPDATE
-- abiertos a cualquier autenticado, reglas de negocio en triggers, no en
-- policies. DELETE restringido a dueño del report o super_admin, igual
-- que "Eliminar reports".
ALTER TABLE report_bodegaje_items ENABLE ROW LEVEL SECURITY;

-- DROP IF EXISTS antes de cada CREATE POLICY — Postgres no soporta "CREATE
-- POLICY IF NOT EXISTS", y este script debe poder re-ejecutarse completo
-- sin error si una corrida anterior falló a mitad de camino.
DROP POLICY IF EXISTS "Autenticados leen report_bodegaje_items" ON report_bodegaje_items;
CREATE POLICY "Autenticados leen report_bodegaje_items"
  ON report_bodegaje_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados crean report_bodegaje_items" ON report_bodegaje_items;
CREATE POLICY "Autenticados crean report_bodegaje_items"
  ON report_bodegaje_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Autenticados actualizan report_bodegaje_items" ON report_bodegaje_items;
CREATE POLICY "Autenticados actualizan report_bodegaje_items"
  ON report_bodegaje_items FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Eliminar report_bodegaje_items" ON report_bodegaje_items;
CREATE POLICY "Eliminar report_bodegaje_items"
  ON report_bodegaje_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_bodegaje_items.report_id
        AND (r.created_by = auth.uid() OR current_user_role() = 'super_admin')
    )
  );

-- ── 4) Inmutabilidad una vez despachado ──────────────────────────────────
-- Reemplaza, para report_bodegaje_items, el candado que hoy vive en
-- validate_report_transition() para sec3_tipo/sec3_numero_pallets/
-- sec3_numero_unidades/sec3_inventario_item_id — esas 3 últimas ya no son
-- columnas de `reports` que puedan compararse OLD vs NEW ahí.
CREATE OR REPLACE FUNCTION lock_bodegaje_items_if_despachado()
RETURNS TRIGGER AS $$
DECLARE
  v_report_id UUID := COALESCE(NEW.report_id, OLD.report_id);
  v_estado    TEXT;
BEGIN
  SELECT estado INTO v_estado FROM reports WHERE id = v_report_id;
  IF v_estado = 'despachado' THEN
    RAISE EXCEPTION 'Un report ya despachado no permite modificar sus productos de Bodegaje';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS report_bodegaje_items_lock ON report_bodegaje_items;
CREATE TRIGGER report_bodegaje_items_lock
  BEFORE INSERT OR UPDATE OR DELETE ON report_bodegaje_items
  FOR EACH ROW EXECUTE FUNCTION lock_bodegaje_items_if_despachado();

-- ── 5) sync_inventario_stock() → se divide en apply/revert, ambos leen la
-- tabla hija en vez de columnas planas de `reports`.
DROP TRIGGER IF EXISTS reports_sync_inventario ON reports;

CREATE OR REPLACE FUNCTION sync_bodegaje_stock_on_reports_change()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Revertir: transición FUERA de despachado. Hoy inalcanzable en la
  -- práctica (validate_report_transition ya bloquea cambiar `estado` una
  -- vez despachado) — se deja por paridad/defensa en profundidad.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'despachado' AND NEW.estado <> 'despachado' THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = OLD.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF OLD.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Aplicar: transición HACIA despachado.
  IF NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado' AND COALESCE(NEW.sec3_activa, FALSE) THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = NEW.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF NEW.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF NEW.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER reports_sync_bodegaje_stock_change
  AFTER INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_bodegaje_stock_on_reports_change();

-- BEFORE DELETE (no AFTER): ON DELETE CASCADE en report_bodegaje_items.report_id
-- se implementa como su propio trigger interno AFTER DELETE sobre `reports` —
-- dos triggers AFTER DELETE en la misma tabla no tienen orden garantizado.
-- Un BEFORE DELETE corre necesariamente antes de que la fila (y su cascada)
-- se borren, así que los ítems hijos están garantizados presentes acá.
CREATE OR REPLACE FUNCTION sync_bodegaje_stock_on_reports_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF OLD.estado = 'despachado' AND COALESCE(OLD.sec3_activa, FALSE) THEN
    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = OLD.id LOOP
      IF v_item.sec3_inventario_item_id IS NOT NULL THEN
        IF OLD.sec3_tipo = 'ingreso' THEN
          UPDATE inventario_items SET
            stock_actual   = GREATEST(0, stock_actual - COALESCE(v_item.sec3_numero_pallets, 1)),
            stock_unidades = GREATEST(0, stock_unidades - COALESCE(v_item.sec3_numero_unidades, 0))
            WHERE id = v_item.sec3_inventario_item_id;
        ELSIF OLD.sec3_tipo = 'despacho' THEN
          UPDATE inventario_items SET
            stock_actual   = stock_actual + COALESCE(v_item.sec3_numero_pallets, 1),
            stock_unidades = stock_unidades + COALESCE(v_item.sec3_numero_unidades, 0)
            WHERE id = v_item.sec3_inventario_item_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS reports_sync_bodegaje_stock_delete ON reports;
CREATE TRIGGER reports_sync_bodegaje_stock_delete
  BEFORE DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_bodegaje_stock_on_reports_delete();

-- ── 6) create_movimiento_from_report() → un movimiento por ítem de
-- Bodegaje, cada uno con su propia tarifa_cliente_id derivada. De paso
-- repone tarifa_cliente_id y los campos de manifiesto (lote/cas/OC/fechas)
-- al movimiento auto-creado — una migración anterior había dejado de
-- propagarlos. Los branches sec1_activa/sec2_activa/else quedan idénticos.
CREATE OR REPLACE FUNCTION create_movimiento_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo     TEXT;
  v_servicio TEXT;
  v_carga    TEXT;
  v_area     TEXT;
  v_cliente_id UUID;
  v_item     RECORD;
  v_has_items BOOLEAN := FALSE;
BEGIN
  IF NOT (NEW.estado = 'despachado' AND COALESCE(OLD.estado, '') <> 'despachado') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cliente_id FROM clientes WHERE nombre = NEW.cliente LIMIT 1;

  IF NEW.sec3_activa THEN
    v_tipo     := COALESCE(NEW.sec3_tipo, 'ingreso');
    v_servicio := 'Almacenaje';

    FOR v_item IN SELECT * FROM report_bodegaje_items WHERE report_id = NEW.id ORDER BY orden LOOP
      v_has_items := TRUE;
      INSERT INTO movimientos (
        tipo, servicio, cliente_id, cliente_nombre, carga, area,
        posiciones, unidades, lote, cas, guia_numero, orden_compra,
        fecha_elaboracion, fecha_vencimiento,
        operador, estado, fecha, report_id, created_by, tarifa_cliente_id
      ) VALUES (
        v_tipo, v_servicio, v_cliente_id, NEW.cliente,
        COALESCE(v_item.sec3_producto, 'Bodegaje'), NULL,
        v_item.sec3_numero_pallets,
        v_item.sec3_numero_unidades,
        v_item.sec3_lote,
        v_item.sec3_cas,
        NEW.sec3_numero_guia,
        v_item.sec3_orden_compra,
        v_item.sec3_fecha_elaboracion,
        v_item.sec3_fecha_vencimiento,
        COALESCE(NEW.nombre_despachador, NEW.nombre_operador),
        'completado',
        COALESCE(NEW.fecha_despacho, NOW()),
        NEW.id,
        NEW.dispatched_by,
        v_item.tarifa_cliente_id
      );
    END LOOP;

    -- Defensivo: sec3_activa=true pero sin ítems (no debería pasar tras el
    -- backfill + UI nueva) — no perder el movimiento silenciosamente.
    IF NOT v_has_items THEN
      INSERT INTO movimientos (
        tipo, servicio, cliente_id, cliente_nombre, carga, area,
        operador, estado, fecha, report_id, created_by, tarifa_cliente_id
      ) VALUES (
        v_tipo, v_servicio, v_cliente_id, NEW.cliente, 'Bodegaje', NULL,
        COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado',
        COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id
      );
    END IF;

  ELSIF NEW.sec1_activa THEN
    v_tipo     := COALESCE(NEW.sec1_tipo_movimiento, 'ingreso');
    v_servicio := 'Almacenaje';
    v_carga    := CONCAT(
      UPPER(COALESCE(NEW.sec1_tipo_contenedor, 'contenedor')),
      CASE WHEN NEW.sec1_carga_imo THEN ' — IMO ' || COALESCE(NEW.sec1_clase_imo, '') ELSE '' END
    );
    v_area     := CASE WHEN NEW.sec1_carga_imo THEN 'Bodega IMO' ELSE NULL END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, v_area, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSIF NEW.sec2_activa THEN
    v_tipo     := 'ingreso';
    v_servicio := 'Logística';
    v_carga    := CASE
      WHEN NEW.sec2_consolidado    THEN 'Consolidado'
      WHEN NEW.sec2_desconsolidado THEN 'Desconsolidado'
      WHEN NEW.sec2_picking        THEN 'Picking'
      ELSE 'Logística'
    END;
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES (v_tipo, v_servicio, v_cliente_id, NEW.cliente, v_carga, NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);

  ELSE
    INSERT INTO movimientos (tipo, servicio, cliente_id, cliente_nombre, carga, area, operador, estado, fecha, report_id, created_by, tarifa_cliente_id)
    VALUES ('ingreso', 'Almacenaje', v_cliente_id, NEW.cliente, 'Sin descripción', NULL, COALESCE(NEW.nombre_despachador, NEW.nombre_operador), 'completado', COALESCE(NEW.fecha_despacho, NOW()), NEW.id, NEW.dispatched_by, NEW.tarifa_cliente_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 7) validate_report_transition(): saca del candado post-despacho las
-- columnas que ya no viven en `reports` (sec3_numero_pallets/
-- sec3_numero_unidades/sec3_inventario_item_id) — su candado real ahora es
-- report_bodegaje_items_lock (punto 4). El resto de invariantes de negocio
-- (documento firmado antes de despachar, no editar tras pendiente_despacho
-- salvo columnas permitidas, no tocar datos de despacho/firma ya despachado)
-- quedan igual.
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old_estado TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'borrador' ELSE OLD.estado END;
  v_permitidas TEXT[] := ARRAY[
    'archivos_pendiente_despacho', 'updated_at',
    'firma_conductor_url', 'firma_recepcion_url', 'firma_bodega_url', 'firma_evidencia'
  ];
BEGIN
  IF NEW.estado = 'despachado' AND v_old_estado <> 'despachado' AND NEW.documento_firmado_url IS NULL THEN
    RAISE EXCEPTION 'No se puede despachar un report sin documento firmado';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendiente_despacho' AND NEW.estado <> 'despachado' THEN
    IF NEW.estado <> OLD.estado
       OR (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
      RAISE EXCEPTION 'Un report en pendiente_despacho solo se puede modificar para despacharlo';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'despachado' AND (
       NEW.estado                    IS DISTINCT FROM OLD.estado OR
       NEW.dispatched_by             IS DISTINCT FROM OLD.dispatched_by OR
       NEW.fecha_despacho            IS DISTINCT FROM OLD.fecha_despacho OR
       NEW.documento_firmado_url     IS DISTINCT FROM OLD.documento_firmado_url OR
       NEW.nombre_despachador        IS DISTINCT FROM OLD.nombre_despachador OR
       NEW.cliente                   IS DISTINCT FROM OLD.cliente OR
       NEW.tarifa_cliente_id         IS DISTINCT FROM OLD.tarifa_cliente_id OR
       NEW.patente                   IS DISTINCT FROM OLD.patente OR
       NEW.conductor                 IS DISTINCT FROM OLD.conductor OR
       NEW.rut_conductor             IS DISTINCT FROM OLD.rut_conductor OR
       NEW.sec3_tipo                 IS DISTINCT FROM OLD.sec3_tipo OR
       NEW.firma_conductor_url       IS DISTINCT FROM OLD.firma_conductor_url OR
       NEW.firma_recepcion_url       IS DISTINCT FROM OLD.firma_recepcion_url OR
       NEW.firma_bodega_url          IS DISTINCT FROM OLD.firma_bodega_url OR
       NEW.firma_evidencia           IS DISTINCT FROM OLD.firma_evidencia
  ) THEN
    RAISE EXCEPTION 'Un report ya despachado no permite modificar datos de despacho/facturación/stock ni firmas';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
