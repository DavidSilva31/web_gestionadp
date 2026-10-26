# Scripts de Supabase

Todo lo que se ejecuta en el **SQL Editor de Supabase**, ordenado en carpetas:

| Carpeta | Qué contiene |
|---|---|
| [`schema.sql`](schema.sql) | Esquema completo de la base (tablas, funciones, RLS, triggers) — solo para armar una base **desde cero**. |
| [`migraciones_aplicadas/`](migraciones_aplicadas) | Cambios de esquema (tablas, columnas, funciones, triggers, políticas, índices), ya ejecutados en producción. 108 archivos. |
| [`cargas_de_datos/`](cargas_de_datos) | Cargas y correcciones puntuales de **datos** (inventarios de clientes, arreglos de un report, reinicio de correlativos), ya ejecutadas. |
| [`demo/`](demo) | Datos de demostración y su limpieza — no usar en producción. |

## Cómo trabajar

- Un cambio nuevo se escribe como `migration_<tema>.sql`, en una sola transacción (`BEGIN; … COMMIT;`) y con una verificación al final que haga fallar todo si algo no cuadra.
- Se ejecuta **una sola vez** en el SQL Editor, y luego se guarda en `migraciones_aplicadas/` (esquema) o en `cargas_de_datos/` (datos). Así esas carpetas son el historial de lo que ya está en producción.
- Para cambiar una base existente se ejecutan solo los bloques delta: **no correr `schema.sql` completo**, porque falla con lo que ya existe.
- Los nombres no llevan fecha. Varias migraciones reescriben la misma función (por ejemplo `rebuild_bodegaje_movimientos` o `create_movimiento_from_report`): **la vigente es la más reciente**, y cada migración nombra en su encabezado la versión que usó de base.
- Con `git log -- supabase/<carpeta>/<archivo>` se ve cuándo se agregó cada archivo.

## Migraciones de esquema (`migraciones_aplicadas/`)

### Reports (formulario, estados, adjuntos, PDF)

- [`migration_documento_firmado_opcional.sql`](migraciones_aplicadas/migration_documento_firmado_opcional.sql) — El documento firmado (PDF/foto del report firmado por el conductor) deja
- [`migration_enable_realtime_reports.sql`](migraciones_aplicadas/migration_enable_realtime_reports.sql) — Habilita Supabase Realtime (postgres_changes) para reports y audit_logs.
- [`migration_firma_conductor.sql`](migraciones_aplicadas/migration_firma_conductor.sql) — Firma del conductor en tablet/lápiz óptico — se dibuja en un canvas en el
- [`migration_firma_electronica.sql`](migraciones_aplicadas/migration_firma_electronica.sql) — Firma electrónica de reports: conductor (en pantalla), Recepción y encargado
- [`migration_fix_validate_report_transition_pendiente_operaciones.sql`](migraciones_aplicadas/migration_fix_validate_report_transition_pendiente_operaciones.sql) — Fix: validate_report_transition() (migration_rls_reports_movimientos_hardening.sql)
- [`migration_report_bodegaje_items.sql`](migraciones_aplicadas/migration_report_bodegaje_items.sql) — Sección 3 (Bodegaje) pasa de UN producto por report a VARIOS — este
- [`migration_report_bodegaje_peso_neto.sql`](migraciones_aplicadas/migration_report_bodegaje_peso_neto.sql) — Peso neto por producto en Bodegaje.
- [`migration_report_servicios.sql`](migraciones_aplicadas/migration_report_servicios.sql) — Servicios asociados a un report — se completan del catálogo del cliente
- [`migration_reports_anular.sql`](migraciones_aplicadas/migration_reports_anular.sql) — Migración: los reports se anulan, nunca se eliminan (para no perder nada
- [`migration_reports_archivos_cualquier_estado.sql`](migraciones_aplicadas/migration_reports_archivos_cualquier_estado.sql) — Archivos adjuntos en cualquier estado del report (detalle /reports/[id]).
- [`migration_reports_archivos_pendiente_despacho.sql`](migraciones_aplicadas/migration_reports_archivos_pendiente_despacho.sql) — Archivos adjuntos mientras el report está en pendiente_despacho — para
- [`migration_reports_bodegaje_pallet_rack.sql`](migraciones_aplicadas/migration_reports_bodegaje_pallet_rack.sql) — UTI Chile trabaja por N° de pallet y rack en vez de posiciones: el producto de Bodegaje de un report
- [`migration_reports_codigo_verificacion.sql`](migraciones_aplicadas/migration_reports_codigo_verificacion.sql) — Migración: código de verificación de 5 dígitos en la esquina superior
- [`migration_reports_contenedores.sql`](migraciones_aplicadas/migration_reports_contenedores.sql) — Contenedores 20ft / 40ft con "Almacenaje Full" o "Almacenaje Vacío" (Sección 1):
- [`migration_reports_despacho_parcial.sql`](migraciones_aplicadas/migration_reports_despacho_parcial.sql) — Despacho Parcial (Sección 1) y Parcial (Sección 2).
- [`migration_reports_despacho_sin_upload.sql`](migraciones_aplicadas/migration_reports_despacho_sin_upload.sql) — Migración: el modal de despacho ya no pide subir un documento firmado
- [`migration_reports_en_proceso.sql`](migraciones_aplicadas/migration_reports_en_proceso.sql) — Estado "en_proceso" para reports de Depósito de Contenedores con 20ft o 40ft
- [`migration_reports_guia_despacho.sql`](migraciones_aplicadas/migration_reports_guia_despacho.sql) — Migración: checkbox "Guía de despacho" en Antecedentes de reports, con
- [`migration_reports_hds_archivo.sql`](migraciones_aplicadas/migration_reports_hds_archivo.sql) — Migración: adjuntar un archivo (HDS — Hoja de Datos de Seguridad) al report
- [`migration_reports_hds_archivos_multi.sql`](migraciones_aplicadas/migration_reports_hds_archivos_multi.sql) — Migración: permitir varios archivos HDS por report (antes era uno solo).
- [`migration_reports_isotanque.sql`](migraciones_aplicadas/migration_reports_isotanque.sql) — Isotanques en la sección 1 del report: cada isotanque es una unidad con su
- [`migration_reports_observaciones_antecedentes.sql`](migraciones_aplicadas/migration_reports_observaciones_antecedentes.sql) — Nuevo campo "Observaciones" en Antecedentes del report — distinto de
- [`migration_reports_pendiente_operaciones.sql`](migraciones_aplicadas/migration_reports_pendiente_operaciones.sql) — Migración: nuevo estado intermedio "pendiente_operaciones" en reports.
- [`migration_reports_recepcion_editor_total.sql`](migraciones_aplicadas/migration_reports_recepcion_editor_total.sql) — La cuenta Recepción (recepcion@altosdelpuerto.cl, rol operador) queda con el
- [`migration_reports_sec1_almacenaje.sql`](migraciones_aplicadas/migration_reports_sec1_almacenaje.sql) — Sección 1 — Depósito de Contenedores: "Almacenaje Full" y "Almacenaje Vacío".
- [`migration_reports_sec1_segundo_contenedor.sql`](migraciones_aplicadas/migration_reports_sec1_segundo_contenedor.sql) — Sección 1 — Depósito de Contenedores: hasta 2 contenedores por report.
- [`migration_reports_sec3_cda.sql`](migraciones_aplicadas/migration_reports_sec3_cda.sql) — Migración: nuevo checkbox "CDA" en Antecedentes, junto a "CUyD" — mismo
- [`migration_reports_sec3_cda_fix.sql`](migraciones_aplicadas/migration_reports_sec3_cda_fix.sql) — Ajuste a migration_reports_sec3_cda.sql: CUyD y CDA pasan a ser mutuamente
- [`migration_reports_sec3_cuyd.sql`](migraciones_aplicadas/migration_reports_sec3_cuyd.sql) — Migración: CUyD como checkbox propio en Antecedentes, independiente de
- [`migration_reports_sec3_imagenes_referencia.sql`](migraciones_aplicadas/migration_reports_sec3_imagenes_referencia.sql) — Imágenes de referencia (opcionales) de la Sección 3 (Bodegaje) del report — mismo patrón que
- [`migration_reports_sec3_manifiesto.sql`](migraciones_aplicadas/migration_reports_sec3_manifiesto.sql) — Migración: nuevos inputs de manifiesto/lote en la Sección 3 (Bodegaje) de
- [`migration_reports_sec3_servicio_adicional.sql`](migraciones_aplicadas/migration_reports_sec3_servicio_adicional.sql) — Migración: check explícito "Servicio Adicional" en Sección 3 (Bodegaje).
- [`migration_reports_sec3_unidades.sql`](migraciones_aplicadas/migration_reports_sec3_unidades.sql) — Migración: nuevo input "N° Unidades" en la Sección 3 (Bodegaje) de reports,
- [`migration_reports_stock_timing.sql`](migraciones_aplicadas/migration_reports_stock_timing.sql) — Corrige el timing del vínculo report → stock: hoy sync_inventario_stock()
- [`migration_reports_transporte_tipo.sql`](migraciones_aplicadas/migration_reports_transporte_tipo.sql) — Migración: reemplaza el campo libre "Empresa de transporte" por un selector
- [`migration_reports_uti_posiciones_automaticas.sql`](migraciones_aplicadas/migration_reports_uti_posiciones_automaticas.sql) — UTI Chile: posiciones automáticas por pallet en los reports (para el HES).
- [`migration_rls_reports_movimientos_hardening.sql`](migraciones_aplicadas/migration_rls_reports_movimientos_hardening.sql) — ============================================================
- [`migration_sec2_evidencia_fotografica.sql`](migraciones_aplicadas/migration_sec2_evidencia_fotografica.sql) — Evidencia fotográfica de Consolidado/Desconsolidado (sección 2 del report)

### Inventario, Kardex y movimientos

- [`migration_bodegaje_contenedor_transporte_y_sku.sql`](migraciones_aplicadas/migration_bodegaje_contenedor_transporte_y_sku.sql) — Report con contenedor 20ft/40ft (Sección 1) + producto en Bodegaje (Sección 3).
- [`migration_fix_bodegaje_carga_item_vinculado.sql`](migraciones_aplicadas/migration_fix_bodegaje_carga_item_vinculado.sql) — Fix: despacho de un producto con lote (report #82, DYFLOC (EPIPAC) (IBC))
- [`migration_fix_default_pallets_bodegaje.sql`](migraciones_aplicadas/migration_fix_default_pallets_bodegaje.sql) — Fix: "N° Pallets" vacío en Bodegaje se interpretaba como 1 pallet en vez
- [`migration_fix_inventario_seq.sql`](migraciones_aplicadas/migration_fix_inventario_seq.sql) — Corrige el desface del correlativo de inventario_items.numero: la
- [`migration_inventario_instalacion.sql`](migraciones_aplicadas/migration_inventario_instalacion.sql) — Migración: enlaza cada ítem de inventario a una instalación física
- [`migration_inventario_items_codigo.sql`](migraciones_aplicadas/migration_inventario_items_codigo.sql) — Código / SKU del producto en el ítem de inventario. Hasta ahora solo vivía
- [`migration_inventario_items_protege_stock.sql`](migraciones_aplicadas/migration_inventario_items_protege_stock.sql) — Auditoría de seguridad: inventario_items INSERT/UPDATE quedó en
- [`migration_inventario_solo_lectura.sql`](migraciones_aplicadas/migration_inventario_solo_lectura.sql) — Inventario en solo lectura para usuarios puntuales (hoy: Jocelyn Olivares).
- [`migration_kardex_inventario.sql`](migraciones_aplicadas/migration_kardex_inventario.sql) — Vista Kardex de inventario (piloto ENAP): campos de manifiesto que faltaban
- [`migration_movimientos_carga_sin_envase.sql`](migraciones_aplicadas/migration_movimientos_carga_sin_envase.sql) — Detalle (Kardex) agrupa movimientos por su columna `carga` — pero
- [`migration_movimientos_delete_policy.sql`](migraciones_aplicadas/migration_movimientos_delete_policy.sql) — Detalle (Kardex de /inventario) necesita poder eliminar una fila de
- [`migration_movimientos_manifiesto.sql`](migraciones_aplicadas/migration_movimientos_manifiesto.sql) — Migración: datos de lote/envase del manifiesto en cada movimiento
- [`migration_movimientos_numero_pallet.sql`](migraciones_aplicadas/migration_movimientos_numero_pallet.sql) — Migración: número de pallet por movimiento (columna "Nr. Pallet" del Kardex,
- [`migration_movimientos_oculto.sql`](migraciones_aplicadas/migration_movimientos_oculto.sql) — Movimientos ocultos: quedan en la base (ligados a su report, con su efecto
- [`migration_movimientos_rack.sql`](migraciones_aplicadas/migration_movimientos_rack.sql) — UTI Chile ubica cada pallet en un RACK (1 al 7, o un contenedor / piso / posición de bodega).
- [`migration_movimientos_sync_pos_und.sql`](migraciones_aplicadas/migration_movimientos_sync_pos_und.sql) — sync_inventario_from_movimiento() movía stock_actual con `unidades` y nunca
- [`migration_movimientos_sync_solo_stock.sql`](migraciones_aplicadas/migration_movimientos_sync_solo_stock.sql) — El trigger de stock de movimientos (movimientos_sync_inventario) se dispara hoy en CUALQUIER
- [`migration_movimientos_tarifa_cliente.sql`](migraciones_aplicadas/migration_movimientos_tarifa_cliente.sql) — Migración: vincula cada movimiento (y cada report) a una tarifa/clase
- [`migration_movimientos_transporte.sql`](migraciones_aplicadas/migration_movimientos_transporte.sql) — Nueva columna "Transporte" en la grilla de Detalle (Kardex) de Inventario
- [`migration_peso_unitario_ton.sql`](migraciones_aplicadas/migration_peso_unitario_ton.sql) — Peso por unidad (ton) — permite recalcular peso_ton automáticamente cada
- [`migration_rebuild_bodegaje_manifiesto.sql`](migraciones_aplicadas/migration_rebuild_bodegaje_manifiesto.sql) — Los movimientos que se generan al despachar un report con Bodegaje quedaban
- [`migration_remove_validate_pallets_check.sql`](migraciones_aplicadas/migration_remove_validate_pallets_check.sql) — Saca ambos chequeos de validate_report_transition()
- [`migration_resync_bodegaje_despachado.sql`](migraciones_aplicadas/migration_resync_bodegaje_despachado.sql) — Migración: cuando un super_admin o Javier Navarro edita un report YA
- [`migration_resync_bodegaje_fixes.sql`](migraciones_aplicadas/migration_resync_bodegaje_fixes.sql) — Ajustes a migration_resync_bodegaje_despachado.sql (correr después de esa):
- [`migration_security_fix_sync_inventario_search_path.sql`](migraciones_aplicadas/migration_security_fix_sync_inventario_search_path.sql) — Fix MEDIO (auditoría de seguridad): sync_inventario_stock() tenía

### Clientes, servicios, tarifas, HES e instalaciones

- [`migration_audit_logs_rls_admin.sql`](migraciones_aplicadas/migration_audit_logs_rls_admin.sql) — Migración: oculta acciones admin.* de audit_logs a roles no super_admin.
- [`migration_clientes_contacto_comercial.sql`](migraciones_aplicadas/migration_clientes_contacto_comercial.sql) — Contacto comercial (quien recibe el HES), separado de los contactos
- [`migration_clientes_contactos.sql`](migraciones_aplicadas/migration_clientes_contactos.sql) — Migración: RUT opcional + datos de contacto ampliados (cargo, teléfono,
- [`migration_clientes_contactos_ampliado.sql`](migraciones_aplicadas/migration_clientes_contactos_ampliado.sql) — Amplía clientes para soportar hasta 3 contactos (con 2 teléfonos cada uno)
- [`migration_clientes_cotizacion.sql`](migraciones_aplicadas/migration_clientes_cotizacion.sql) — Clientes propios del módulo de Cotizaciones (no forman parte de `clientes`).
- [`migration_clientes_multi_email.sql`](migraciones_aplicadas/migration_clientes_multi_email.sql) — Migración: permite que un cliente tenga más de un correo asociado.
- [`migration_clientes_stock_compartido.sql`](migraciones_aplicadas/migration_clientes_stock_compartido.sql) — Pool de stock compartido entre clientes — permite que un cliente use el
- [`migration_dia_corte_facturacion.sql`](migraciones_aplicadas/migration_dia_corte_facturacion.sql) — Migración: ciclo de facturación configurable por cliente.
- [`migration_fix_servicios_cliente_policies.sql`](migraciones_aplicadas/migration_fix_servicios_cliente_policies.sql) — Migración: corrige un hueco real encontrado en auditoría — servicios_cliente
- [`migration_hes_folios.sql`](migraciones_aplicadas/migration_hes_folios.sql) — Migración: folio correlativo por cada HES generado + registro de emisión.
- [`migration_instalaciones_almacenamiento.sql`](migraciones_aplicadas/migration_instalaciones_almacenamiento.sql) — Migración: catálogo de referencia de instalaciones de almacenamiento
- [`migration_servicios_cliente_categoria.sql`](migraciones_aplicadas/migration_servicios_cliente_categoria.sql) — Separa el catálogo de servicios_cliente por tipo: "transporte" debe
- [`migration_tarifas_moneda_clp.sql`](migraciones_aplicadas/migration_tarifas_moneda_clp.sql) — Migración: soporte de tarifas en pesos (CLP) además de UF.

### Cotizaciones y Tarifado Transporte

- [`migration_cotizaciones.sql`](migraciones_aplicadas/migration_cotizaciones.sql) — Módulo de Cotizaciones (migrado desde el portal Grails "Gestión de OC y Cotizaciones").
- [`migration_cotizaciones_ocultar_totales.sql`](migraciones_aplicadas/migration_cotizaciones_ocultar_totales.sql) — 
- [`migration_tarifado_observaciones_propias.sql`](migraciones_aplicadas/migration_tarifado_observaciones_propias.sql) — Tarifado Transporte: observaciones propias (las de la hoja AJUSTADA de
- [`migration_tarifado_resaltados.sql`](migraciones_aplicadas/migration_tarifado_resaltados.sql) — Tarifado Transporte: casillas resaltadas por tarifa, para que el cliente ubique rápido su
- [`migration_tarifado_transporte.sql`](migraciones_aplicadas/migration_tarifado_transporte.sql) — Módulo "Tarifado Transporte": tarifas escalonadas según tramo de valor del diésel,
- [`migration_uf_valores_cache.sql`](migraciones_aplicadas/migration_uf_valores_cache.sql) — Migración: caché de valores UF por fecha para el módulo HES.

### Transporte (Incomex, conductores y empresas)

- [`migration_conductores.sql`](migraciones_aplicadas/migration_conductores.sql) — Migración: catálogo de choferes (combobox "Conductor"/"RUT conductor" en
- [`migration_empresas_transporte.sql`](migraciones_aplicadas/migration_empresas_transporte.sql) — Migración: catálogo de empresas de transporte externo (combobox "Empresa
- [`migration_fix_transporte_incomex_report_id_unique.sql`](migraciones_aplicadas/migration_fix_transporte_incomex_report_id_unique.sql) — Fix: el índice único parcial (WHERE report_id IS NOT NULL) no calza como
- [`migration_fix_transporte_incomex_seq.sql`](migraciones_aplicadas/migration_fix_transporte_incomex_seq.sql) — Fix: "duplicate key value violates unique constraint
- [`migration_security_fix_transporte_incomex_select.sql`](migraciones_aplicadas/migration_security_fix_transporte_incomex_select.sql) — Fix ALTO (auditoría de seguridad): transporte_incomex permitía SELECT a
- [`migration_transporte_incomex.sql`](migraciones_aplicadas/migration_transporte_incomex.sql) — Módulo Transporte Incomex — registro de viajes de transporte subcontratado
- [`migration_transporte_incomex_desde_report.sql`](migraciones_aplicadas/migration_transporte_incomex_desde_report.sql) — Vincula reports con Transporte Incomex: al guardar un report con
- [`migration_transporte_incomex_origen_destino.sql`](migraciones_aplicadas/migration_transporte_incomex_origen_destino.sql) — Migración: el trigger que auto-genera la fila de Transporte ADP desde un
- [`migration_transporte_incomex_solo_despachado.sql`](migraciones_aplicadas/migration_transporte_incomex_solo_despachado.sql) — sync_transporte_incomex_from_report() creaba la fila en transporte_incomex

### Equipos

- [`migration_equipos.sql`](migraciones_aplicadas/migration_equipos.sql) — Módulo "Equipos" (Administración): notebooks/PCs y tablets entregados a trabajadores,
- [`migration_equipos_actas_cualquier_archivo.sql`](migraciones_aplicadas/migration_equipos_actas_cualquier_archivo.sql) — Equipos: las actas de entrega pueden ser cualquier tipo de archivo (PDF, Word, imágenes escaneadas, etc.).

### Seguridad, permisos, perfiles y rendimiento

- [`migration_indices_performance.sql`](migraciones_aplicadas/migration_indices_performance.sql) — Índices de performance — auditoría de BD (18-08-2026). tarifas_cliente no
- [`migration_indices_revision.sql`](migraciones_aplicadas/migration_indices_revision.sql) — Revisión de índices (comparando los declarados en el repo con las consultas reales
- [`migration_profiles_accent_color.sql`](migraciones_aplicadas/migration_profiles_accent_color.sql) — Migración: color de acento personalizable (tema claro) por usuario.
- [`migration_profiles_avatar_icon.sql`](migraciones_aplicadas/migration_profiles_avatar_icon.sql) — Migración: permite elegir un ícono como avatar en Mi Perfil
- [`migration_profiles_notificaciones.sql`](migraciones_aplicadas/migration_profiles_notificaciones.sql) — Migración: agrega preferencia de notificaciones por usuario.
- [`migration_profiles_update_policy.sql`](migraciones_aplicadas/migration_profiles_update_policy.sql) — Migración: permite que cada usuario actualice su propio perfil
- [`migration_rls_initplan.sql`](migraciones_aplicadas/migration_rls_initplan.sql) — Rendimiento de RLS: en las políticas de public, current_user_role() y auth.uid() se
- [`migration_rls_roles_hardening.sql`](migraciones_aplicadas/migration_rls_roles_hardening.sql) — Migración: aplica el sistema de roles (super_admin/operador/operador_carga)
- [`migration_security_fix_reports_state_machine_v2.sql`](migraciones_aplicadas/migration_security_fix_reports_state_machine_v2.sql) — Ajuste sobre migration_security_fix_reports_state_machine.sql (ya
- [`migration_security_password_reset_cooldown.sql`](migraciones_aplicadas/migration_security_password_reset_cooldown.sql) — Fix MEDIO (auditoría de seguridad): /api/auth/forgot-password no tenía
- [`migration_security_storage_objects_policies.sql`](migraciones_aplicadas/migration_security_storage_objects_policies.sql) — Fix MEDIO (auditoría de seguridad): las políticas RLS de storage.objects
- [`supabase_security_fixes.sql`](migraciones_aplicadas/supabase_security_fixes.sql) — ═══════════════════════════════════════════════════════════════════

### Otros

- [`migration_fix_movimiento_seq.sql`](migraciones_aplicadas/migration_fix_movimiento_seq.sql) — Fix: movimiento_seq quedó desincronizada del máximo `numero` ya usado en
- [`migration_fix_sync_movimiento_stock.sql`](migraciones_aplicadas/migration_fix_sync_movimiento_stock.sql) — Bug preexistente: sync_inventario_from_movimiento() (trigger sobre
- [`migration_uti_posiciones_clase_mas_cara.sql`](migraciones_aplicadas/migration_uti_posiciones_clase_mas_cara.sql) — UTI Chile: cada pallet cuenta UNA posición, en la clase más cara que contiene (así se factura).

## Cargas y correcciones de datos (`cargas_de_datos/`)

- [`migration_enap_separar_transporte.sql`](cargas_de_datos/migration_enap_separar_transporte.sql) — Cliente ENAP tenía servicios de Almacén y de Transporte mezclados en un
- [`migration_fix_helson_refrigerante_separar_sku.sql`](cargas_de_datos/migration_fix_helson_refrigerante_separar_sku.sql) — HELSON MUÑOZ: el REFRIGERANTE R134A (report #71) y el R507A (report #127) quedaron
- [`migration_fix_report103_solo_contenedor.sql`](cargas_de_datos/migration_fix_report103_solo_contenedor.sql) — Corrección puntual: el report #103 (GABRIEL DE LUCAS ZAMORANO) se registró por
- [`migration_fix_report145_volver_a_operaciones.sql`](cargas_de_datos/migration_fix_report145_volver_a_operaciones.sql) — Corrección puntual: el report #145 (HELSON MUÑOZ Y CÍA. LTDA.) se envió a la cola
- [`migration_fix_report80_duplicados.sql`](cargas_de_datos/migration_fix_report80_duplicados.sql) — Limpieza puntual: report 80 (GOWAN CHILE SPA) quedó con las 4 líneas de
- [`migration_fix_sherwin_carga_nombre_producto.sql`](cargas_de_datos/migration_fix_sherwin_carga_nombre_producto.sql) — Sherwin Williams: los ingresos de los 137 productos se guardaron con el nombre sin sufijo
- [`migration_fix_sku_saldo_inicial_enap.sql`](cargas_de_datos/migration_fix_sku_saldo_inicial_enap.sql) — Migración (dato, no esquema): limpia el SKU de los movimientos de saldo
- [`migration_fix_stock_residual_report80.sql`](cargas_de_datos/migration_fix_stock_residual_report80.sql) — Corrige el residuo de stock que dejó la limpieza del report #80
- [`migration_reset_sequences.sql`](cargas_de_datos/migration_reset_sequences.sql) — Reinicia a 1 la numeración visible al usuario (cliente #1, report #1,
- [`migration_uti_carga_inventario.sql`](cargas_de_datos/migration_uti_carga_inventario.sql) — UTI CHILE: cargar el inventario desde docs/PLANTILLA INV.UTICHILE.xlsx (hoja "SCTOCK", 644 filas).
- [`migration_wilhelmsen_recarga_inventario.sql`](cargas_de_datos/migration_wilhelmsen_recarga_inventario.sql) — WILHELMSEN SHIPS SERVICE (CHILE) SPA: limpiar todo su inventario y volver a cargarlo desde

## Demo (`demo/`)

- [`demo_data.sql`](demo/demo_data.sql) — ═══════════════════════════════════════════════════
- [`demo_data_cleanup.sql`](demo/demo_data_cleanup.sql) — ═══════════════════════════════════════════════════
- [`demo_data_hes.sql`](demo/demo_data_hes.sql) — ═══════════════════════════════════════════════════════════════════
