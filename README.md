# ADP Gestión

Sistema de gestión interna para las operaciones de bodega de **Altos del Puerto** (Camino La Pólvora 106, Valparaíso). Permite registrar movimientos de carga, controlar inventario, administrar clientes, emitir reportes de recepción, calcular hojas de estadía (HES) para facturación y gestionar usuarios con roles diferenciados.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | Tailwind CSS v4 + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Auth | @supabase/ssr (PKCE flow, SSR cookies) |
| PDF | @react-pdf/renderer + window.print() |
| Excel | ExcelJS + xlsx |
| Gráficos | Recharts |
| Fonts | DM Sans + Inter (next/font) |
| Deploy | Netlify + @netlify/plugin-nextjs |

## Requisitos

- Node.js 20+
- Proyecto Supabase configurado con las tablas correspondientes
- Archivo `.env.local` con las variables de entorno (ver abajo)

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://tu-sitio.netlify.app   # URL de producción (para redirects de auth)
RESEND_API_KEY=...                                   # Envío de HES por correo (/api/hes/send-email)
RESEND_FROM_EMAIL=...
GEMINI_API_KEY=...                                   # Asistente virtual (/api/chatbot) — sin esta key el widget responde "no configurado"
GEMINI_MODEL=gemini-3.1-flash-lite                   # Opcional, este es el default
SHAREPOINT_TENANT_ID=...                             # Subir cotizaciones a SharePoint (Microsoft Graph, app registration con Sites.Selected)
SHAREPOINT_CLIENT_ID=...
SHAREPOINT_CLIENT_SECRET=...                         # Valor del secreto del app registration — solo servidor, nunca al cliente
SHAREPOINT_SITE_ID=...                               # ID Graph del sitio (host,siteCollectionId,webId)
SHAREPOINT_BASE_PATH=HES Y COTIZACIONES/COTIZACIONES/COTIZACIONES   # Carpeta base; dentro se crea una carpeta por año
SHAREPOINT_TARIFADO_PATH=HES Y COTIZACIONES/COTIZACIONES/TARIFADO TRANSPORTE   # (opcional) Carpeta base de los Tarifado Transporte; dentro se crea una carpeta por año
SHAREPOINT_BACKUP_PATH=RESPALDOS ADP                      # (opcional) Carpeta del sitio donde se guardan el respaldo semanal y el del inventario
BACKUP_CRON_SECRET=...                               # Clave entre la función programada y la función de respaldo (solo Netlify)
```

> **Importante:** `SUPABASE_SERVICE_ROLE_KEY` nunca se expone al cliente. Solo se usa en rutas API de servidor (`/api/admin/*`).
>
> En Supabase → Authentication → URL Configuration se debe agregar la URL de producción en **Site URL** y **Redirect URLs** para que el flujo de reset de contraseña funcione correctamente.

## Instalación y ejecución

```bash
npm install
npm run dev        # http://localhost:4400
npm run build
npm run start
```

---

## Roles y acceso

| Rol | Acceso |
|---|---|
| `super_admin` | Acceso completo, incluido gestión de usuarios, auditoría y Cotizaciones |
| `operador` | Acceso completo excepto gestión de usuarios y auditoría |
| `operador_carga` | Solo inventario, reports y cola de despacho |

**Inventario en solo lectura**: un usuario con `profiles.inventario_solo_lectura = true` (hoy se asigna por SQL, ver `migration_inventario_solo_lectura.sql`) entra al módulo Inventario pero no ve ningún control de edición (Registrar ítem, lápiz/papelera, "Editar" del Detalle). En la base de datos un trigger rechaza crear, editar o desactivar productos (`inventario_items`) cuando el cambio es directo del usuario; despachar reports sigue funcionando porque esos cambios los hacen triggers internos. **Límite:** las ediciones del Detalle escriben en `movimientos`, tabla que también usa el módulo Movimientos, así que ahí el bloqueo es solo de pantalla. La marca no la puede cambiar el propio usuario (igual que role/permisos).

El proxy (`src/proxy.ts`) protege todas las rutas autenticadas y restringe `/auditoria` y `/configuracion` (tab usuarios) a `super_admin` únicamente, usando `canAccess()` con `ROLE_ROUTES` por rol.

---

## Módulos

### Inventario (`/inventario`)

Control de ítems almacenados por cliente:

- Panel izquierdo con lista de clientes; panel derecho con ítems del cliente seleccionado
- Columnas: código/SKU (`inventario_items.codigo`), descripción, área, categoría, stock actual, unidad y estado (Normal / Bajo / Crítico)
- Alta de ítems con stock inicial; edición de metadatos (el stock solo cambia vía movimientos)
- Baja lógica (`activo = false`)
- Exportar inventario del cliente a Excel
- Indicadores de estado semánticos por cliente y por ítem
- **Pool de stock compartido**: un cliente puede apuntar a `stock_compartido_con` otro (mismo inventario físico, facturación separada) — resuelto en cada punto de lectura/escritura vía `resolveEffectiveClienteId()`
- **Panel de clientes colapsable**: al seleccionar un cliente, la columna izquierda se recoge a un riel angosto de solo avatares (con botón para volver a expandir), liberando espacio en pantalla para la vista de Detalle
- **Vista "Detalle" (Kardex)**: disponible para todos los clientes — toggle Resumen/Detalle junto al agregado habitual; muestra el historial transaccional real **una sola grilla por producto** (agrupado por `carga`, no por lote/código individual) con saldo corrido (posiciones y unidades). El saldo parte del stock actual del ítem (`stock_actual`/`stock_unidades`), así el último saldo coincide siempre con el stock de Resumen. Los productos sin movimientos aparecen con el encabezado "0 movimientos". Filtro de Producto con buscador tipo combobox (escribir para filtrar, sin el viejo `<select>` nativo); navegación solo con scroll nativo horizontal/vertical (barras más gruesas que el resto de la app, sin arrastre por clic). Columnas: **SKU** (código del producto, constante para cada uno), **Nr. Pallet**, fecha, tipo, IMO, **NU**, lote, CAS, guía, OC, fechas de elaboración/vencimiento, envase, report de origen, posiciones/unidades de ingreso y despacho, stock corrido y bodega — todas editables inline
- **Report clicable en el Detalle**: el número de la columna "Report" abre el report en un visor (el mismo PDF de Reports, con botón Descargar) encima de Inventario, sin salir de la pantalla; en modo "Editar" vuelve a ser la celda editable
- **Detalle por N° de pallet** (`detallePorPallet()` en `src/lib/inventario.ts`, hoy solo **Sherwin Williams**): como todo es PINTURA y lo único que distingue cada línea es el pallet, el Detalle reemplaza los filtros de producto/IMO por un selector con los pallets del sistema y no muestra ninguno hasta elegir uno. Cada pallet es un producto distinto: nombre `PINTURA (859) (CAJA)`, SKU = N° de pallet (`inventario_items.codigo`), 1 posición y las unidades del pallet en un movimiento de ingreso con `carga` propia (`PINTURA (859)`), así cada uno tiene su saldo. Así se reciben en un report: `{producto} ({envase}) {sku}`
- **Nombre del producto editable**: con "Editar" activo, el nombre de cada producto en la cabecera de su grilla es una celda editable. Cambia el nombre del ítem y el texto `carga` de todos sus movimientos (así Kardex, Excel y HES lo muestran igual) y queda en Auditoría. El trigger de stock de `movimientos` solo se dispara al cambiar tipo, unidades, posiciones o producto (`UPDATE OF`), así editar textos no recalcula el stock
- **Detalle de UTI Chile** (`detalleConRack()`): igual que el de Sherwin (selector de pallets, nada hasta elegir uno) pero con más: columna **Rack** (editable), pallets con varios valores como `401/403` (se encuentran buscando 401 o 403), un **filtro de Lote** que aparece cuando el pallet elegido tiene 2 o más lotes, y un buscador **SKU o lote** para ver en qué pallets está un lote. UTI no usa posiciones en pantalla: se ocultan las columnas Ing./Desp./Stock Pos. Cada SKU es un producto (`LIMPIEZA INDUSTRIAL (SKU)`) y cada línea de pallet un movimiento con su N° de pallet, rack, lote y bodega
- El selector de producto del Detalle lista cada nombre una sola vez (dos productos pueden llamarse igual) y al elegirlo muestra todos los que lo llevan
- **Filtro por lote** en la vista Detalle: el saldo corrido y la grilla se pueden acotar a un lote específico; el stock mostrado se calcula sobre ese lote
- Los movimientos marcados como **ocultos** (`movimientos.oculto = true`) siguen en la base y mantienen su efecto de stock y su vínculo con el report, pero no aparecen en el Kardex ni en las sugerencias de lote
- **Stock Pos / Stock Und editables** en la vista Detalle (con el modo "Editar" activado): al cambiar un saldo se inserta un movimiento de ajuste por la diferencia (1 segundo después del movimiento editado), sin tocar los movimientos existentes. Es la forma de corregir un stock sin pasar por SQL
- **Alta de producto** (formulario de `/inventario` y alta rápida desde un report): el SKU se guarda en el propio ítem (`inventario_items.codigo`). Solo se crea un movimiento de ingreso inicial si hay stock real (o, en el alta completa, lote, vencimiento, envase, bodega o transporte); el alta rápida ya no genera una fila 0/0 vacía en el Kardex. Además hay un guard síncrono contra doble guardado, reutiliza el ítem ya creado si el ingreso inicial falla y se reintenta, y en el alta rápida **reutiliza el producto existente** si el cliente ya tiene uno con el mismo nombre (y mismo SKU o sin SKU) en vez de duplicarlo

### Movimientos (`/movimientos`)

Registro de ingresos y despachos de carga:

- Filtro por tipo (todos / ingreso / despacho) y por año (2024–actual)
- **4 stat cards**: total, ingresos, despachos y en proceso
- Tabla con: código (MOV-001), servicio, cliente/carga, área, fecha y estado
- Crear nuevo movimiento (ingreso o despacho) con validación de stock atómica: si el RPC `update_stock` falla se hace rollback del INSERT
- Datos de manifiesto opcionales (colapsables): código/SKU, IMO, NU, CAS, lote, fechas de elaboración/vencimiento, envase, posiciones, **Nr. Pallet**, N° guía, orden de compra, bodega
- Marcar "En proceso" → "Completado" desde la tabla
- Exportar tabla filtrada a Excel
- Ocultar un movimiento (`oculto`) sin borrarlo: se usa cuando un movimiento antiguo no debe contarse en Kardex ni en las sugerencias de lote, pero debe conservarse por trazabilidad

### Clientes (`/clientes`)

Directorio de empresas con carga en bodega:

- Búsqueda por nombre o RUT
- Alta, edición y desactivación de clientes
- Sector económico con badges de color
- **Contactos separados por rol**: contacto comercial (recibe el HES — nombre/cargo/teléfono, correos en `emails[]`) distinto de hasta 3 contactos operacionales (nombre/cargo/correo/teléfono cada uno)
- **Día de corte de facturación** editable (1 a 31): 1 = mes calendario; otro día = ciclo (ej. 26: del 26 al 25 del mes siguiente). Lo usa el HES de ese cliente
- Vínculo de **stock compartido** con otro cliente (mismo pool de inventario, facturación independiente)
- Activación del flag **"Usa vista Detalle"** (Kardex) en Inventario

### Servicios (`/servicios`)

Gestión de servicios contratados por cliente:

- Lista de clientes con contador de servicios activos (badge actualizado desde DB)
- Formulario inline para crear, editar y eliminar servicios
- Campos: nombre, descripción, tarifa (UF), unidad, orden

### Reports (`/reports`)

Informes de recepción de carga:

- Lista con tabs: Todos / Pendiente despacho / Despachados / Borradores
- **Semáforo de estado**: punto de color junto al badge de estado (en la lista y en el detalle) — amarillo = borrador (antecedentes listos), azul = pendiente de despacho (falta que el chofer vuelva a recepción con el físico), verde = despachado
- **Crear report** (`/reports/nuevo`): formulario multi-sección con tabs navegables:
  - Antecedentes (cliente, patente, conductor, **empresa de transporte** — combobox editable: admite escribir un valor nuevo y lo persiste en la tabla `empresas_transporte`, con ícono de eliminar + confirmación en la lista desplegable)
  - Sección 1 — Depósito de contenedores. Con tipo **Isotanque**: en Ingreso se escribe el código del contenedor (campo "Código del isotanque", guardado en `sec1_sigla`); en Despacho se elige de una lista con los isotanques que están en bodega para el cliente. Al despachar, el movimiento lleva el código y descuenta 1 unidad del ítem ISOTANQUE del cliente (ver `migration_reports_isotanque.sql`)
  - Sección 2 — Consolidado / Desconsolidado / Otros (con dropzone/cámara para **evidencia fotográfica** cuando se marca consolidado o desconsolidado)
  - Sección 3 — Bodegaje: se completa en Operaciones, no en este formulario
  - **Alta rápida de producto nuevo**: si el producto que busca en el Producto de Bodegaje no existe en Inventario, el botón "+ Nuevo producto" abre el mismo formulario de alta de `/inventario` (descripción, categoría, instalación, Clase IMO, N° ONU, unidad, stock, peso, stock mínimo); al guardar, el producto queda creado y seleccionado en el report al instante, sin recargar la página
  - **Adjuntos**: una sola caja de adjuntar cubre tanto **HDS** como **Guía de despacho** (checkboxes independientes sobre el mismo dropzone)
  - **Firma del conductor**: recuadro con canvas táctil (pensado para tablet + lápiz) entre los servicios asociados y el cierre del report
- **Detalle** (`/reports/[id]`): vista y edición completa; al pasar borrador → pendiente_despacho llama `update_stock` con rollback si falla
  - **Sección 3 — Bodegaje admite múltiples productos** por report (tabla `report_bodegaje_items`, una fila por producto): Hora de inicio/término quedan a nivel de sección (compartidas), y cada producto tiene su propio Clase IMO/NU/N° bodega/pallets/unidades/lote/CAS/OC/fechas de elaboración-vencimiento y su **propia tarifa** derivada automáticamente por Clase IMO — se guarda con patrón "reemplazar todo" (se borran y reinsertan las filas del report). Al despachar, el trigger `create_movimiento_from_report()` genera un `movimiento` por producto, cada uno con su tarifa y datos de manifiesto propios (así el HES ya factura por línea de producto sin cambios adicionales)
- **Cola de despacho** (`/reports/despacho`): cards expandibles con confirmación de salida de vehículo — **el documento firmado es opcional** en ambos flujos de despacho (cola completa y despacho rápido desde la lista), ya no bloquea el despacho si el report ya está firmado digitalmente
- Exportar report individual a **PDF** (con logotipo `adp_logo_hd.png` en cabecera):
  - Secciones 1/2/3 sin datos se colapsan a solo el nombre de la sección + "N/A — no aplica", en vez de mostrar todos los campos vacíos
  - Sello rediseñado: logo ADP + RUT 76.499.190-7 + fecha, con borde doble — ya no muestra el nombre del despachador. Dice **INGRESADO** o **DESPACHADO** según el tipo de movimiento del report (antes decía siempre DESPACHADO)
  - El campo **Observaciones** de Antecedentes se imprime en el recuadro de Antecedentes (antes se guardaba pero no salía en el PDF)
  - La Sección 1 muestra "Sigla 2" e "Interchange 2" cuando el report tiene un segundo contenedor
  - El nombre de archivo de descarga es siempre `report-{numero}`, tanto desde el botón propio de la app como desde el botón de descarga del visor nativo de PDF del navegador
- **Filtro "Hoy"** activado por defecto en la lista, para la vista operativa del día (se puede desactivar)
- **Código de verificación**: cada report recibe automáticamente un código de 5 dígitos (generado por trigger en la base) que siempre suma 15; se imprime en la esquina superior derecha del recuadro "Antecedentes" del PDF
- **CUyD / CDA** (Sección 3): son mutuamente excluyentes — al completar uno se bloquea el otro
- **Catálogo de conductores** (`conductores`): los campos Conductor y RUT se autocompletan entre sí; al enviar a Operaciones el chofer se guarda (upsert por RUT), así un mismo RUT siempre trae el mismo nombre aunque cambie de camión
- **Firma del conductor y firma personal**: además del canvas, se puede arrastrar y soltar o seleccionar una imagen de firma
- **Contenedores 20ft / 40ft (Sección 1)**: además del tipo de contenedor (20ft, 40ft, Isotanque) hay dos casillas excluyentes, **Almacenaje Full** y **Almacenaje Vacío** (solo con 20ft/40ft), para ingresar o despachar el contenedor entero. Esos contenedores se llevan como el producto **CONTENEDORES** del cliente (1 unidad cada uno, la sigla hace de SKU y el envase del movimiento dice Full o Vacío), igual que los isotanques
- **Hasta 2 contenedores de 20ft por report** (Sección 1): un camión puede llevar 2 de 20ft, 1 de 40ft o 1 isotanque. Con 20ft aparece "+ Agregar segundo contenedor" (Sigla 2 e Interchange 2; tipo, horas, Clase IMO/NU y Almacenaje se comparten); al cambiar a 40ft o isotanque el segundo se borra solo. Columnas `reports.sec1_sigla_2` y `sec1_interchange_2`. Cada contenedor genera su propio movimiento (isotanque, Almacenaje Full/Vacío y producto en contenedor); Transporte Incomex muestra "SIGLA1 / SIGLA2". Las columnas nuevas vacías no entran en la huella de firma, así los reports ya firmados no cambian
- **Despacho de contenedor (20ft/40ft/isotanque)**: con Despacho en Antecedentes, la Sigla pasa a "Contenedor a despachar" y es una **lista de los contenedores que están en bodega** para el cliente (la segunda sigla no repite la primera). En 20ft/40ft, al elegir uno se marca solo "Almacenaje Vacío" (así se descuenta del stock y el report se cierra al salir el camión). Si el cliente no tiene contenedores en bodega, el campo queda libre
- **Producto que llega en contenedor (Sección 1 + Sección 3)**: en un ingreso con 20ft/40ft y sigla, el Transporte del producto es la sigla del contenedor (antes copiaba el texto libre de la empresa de transporte) y el contenedor queda además registrado como producto **CONTENEDORES** del cliente (SKU = sigla, envase Vacío, o Full si se marcó), para poder despacharlo después. Todo se arma dentro de `rebuild_bodegaje_movimientos()`, así una edición posterior no lo pierde ni lo duplica
- **N° Pallets vacío = 0**: dejar los pallets en blanco (ej. despacho de unidades sueltas) se calcula como 0 posiciones, no como 1 (corregido en `rebuild_bodegaje_movimientos()`, `sync_inventario_from_movimiento()` y los triggers de revertir/borrar)
- **Producto vinculado al inventario**: el movimiento usa como `carga` la descripción real del ítem de inventario (antes se le recortaba el envase "(IBC)", lo que partía el Kardex en un grupo "fantasma" con stock negativo)
- **Sin doble guardado**: `handleSave()` tiene un guard síncrono (un `disabled` en el botón no alcanza a bloquear un segundo click) — un doble guardado duplicaba las líneas de Bodegaje y descontaba el stock dos veces
- **Despachar más de lo que hay**: el stock nunca queda negativo — un despacho sobre un producto sin ingreso previo se "topa" en 0 y el Kardex muestra solo el despacho. Si la carga entró antes del sistema, hay que registrar su ingreso
- **Estado "En proceso"**: un 20ft/40ft **sin** Almacenaje Full/Vacío requiere que Operaciones complete el consolidado/desconsolidado, que es lento. Al despachar el camión el report queda "En proceso - Consolidado/Desconsolidado" (el chofer se va y el PDF ya sale con el sello), y Operaciones lo cierra con "Finalizar" desde el detalle; recién ahí pasa a "Finalizado" y se generan movimientos y stock. Isotanque y los contenedores con Full/Vacío se cierran al despachar el camión. Hay una pestaña "En proceso" en la lista
- **Un solo "Tipo de movimiento" y una sola hora**: el Ingreso/Despacho de Antecedentes manda también en la Sección 1, y las horas de inicio/término de la Sección 3 mandan para todo el report (la Sección 2 ya no las pide)
- **Peso neto en Bodegaje**: un mismo lote puede tener 2 o más pesos netos distintos (uno por fila de ingreso). Al elegir producto y lote, el formulario muestra el campo "Peso neto" con los pesos que ese lote ya tiene y las posiciones que quedan de cada uno, para elegir de cuál ingresar o despachar. El campo se muestra siempre (si el lote es nuevo, el peso se escribe a mano)
- **Sigla de contenedor / código de isotanque** (`src/lib/sigla.ts`): se arma sola como `XXXXXX-X` mientras se escribe (el guion aparece desde el 2.º carácter y se corre con cada carácter nuevo); no se guarda con un solo carácter. Los reports anteriores sin guion no se tocan
- **N° Guía opcional**: ya no es obligatorio para guardar un report
- **Guardar sin cambiar de estado**: en "Pendiente operaciones" hay un botón **Guardar cambios** además de "Enviar a despacho"; antes la única forma de guardar era avanzar el estado
- **Lista de reports**: los abiertos arriba y los finalizados (despachado, anulado) abajo, separados por una fila "Finalizados"; dentro de cada grupo, por número descendente
- **IMO, NU y fechas de lote automáticos**: al elegir un producto en Bodegaje, la Clase IMO y el NU salen de la ficha y, si ahí faltan, del último movimiento; al elegir un lote conocido se completan sus fechas de elaboración y vencimiento
- **Imágenes de referencia (Sección 3)**: debajo de Observaciones se pueden adjuntar imágenes JPG/PNG opcionales (máx. 10 MB) como referencia; se suben al guardar al bucket `reports-firmados` y sus paths quedan en `reports.sec3_imagenes_referencia`. Solo en la pantalla de edición, y no salen en el PDF
- **N° Posición**: en Bodegaje, el campo que se llamaba "N° Pallets" pasó a "N° Posición" (el de unidades sigue igual). En un **despacho**, al elegir el producto se precargan su Clase IMO, NU y N° de bodega desde lo ya guardado
- **Bodegaje de UTI Chile** (por pallet, no por posiciones): el formulario trae **N° Pallet** y **Rack** en vez de N° Posición, y no pide CAS, OC ni fechas. En un despacho el pallet se elige entre los que tienen stock de ese producto (con sus unidades y rack), el lote entre los de ese pallet y se avisa cuánto queda disponible; en un ingreso se elige un pallet existente o se escribe uno nuevo. Al despachar el report, `rebuild_bodegaje_movimientos()` calcula las **posiciones** solas, solo para el HES: un ingreso a un pallet sin stock suma 1 (en la línea de la clase más cara); un despacho que deja el pallet en 0 unidades resta 1 con un movimiento aparte de 0 unidades (oculto en el Detalle). Las líneas despachadas descuentan solo unidades. El PDF y el Excel muestran pallet y rack
- **Despacho Full / Vacío / Parcial (Sección 1)**: en un despacho de 20ft/40ft hay tres opciones excluyentes: **Despacho Full**, **Despacho Vacío** y **Despacho Parcial** (en un ingreso siguen "Almacenaje Full/Vacío"). Full y Vacío eligen el contenedor de la lista de los que están en bodega, **filtrada por ese estado** (cada sigla muestra si está Full o Vacía). **Parcial** es el contenedor que llega lleno, se desconsolida en parte y se va con carga: nunca estuvo en bodega, así que la sigla se escribe, **no mueve el stock de CONTENEDORES** y el report pasa a "En proceso" como un contenedor sin Full/Vacío (`sec1_almacenaje = 'parcial'`). En la **Sección 2** hay una opción **Parcial** (`sec2_parcial`) para marcar una consolidación o desconsolidación parcial
- **Quitar archivos adjuntos**: los adjuntos de HDS/Guía, la evidencia de la Sección 2 y las imágenes de la Sección 3 tienen una X para quitarlos del report (con confirmación en un popup con el diseño de la web, `ConfirmarDialogo`); se guarda al instante, queda en Auditoría y el archivo sigue en el almacenamiento privado, que no se borra desde la app
- **Tomar foto**: junto a cada zona de adjuntos hay un botón **Tomar foto** que abre la cámara de la tablet o el celular directamente (`TomarFotoBoton`, `capture="environment"`); se saca la foto y queda adjunta. Está en la evidencia de la Sección 2, las imágenes de la Sección 3, los adjuntos de HDS/Guía, el panel de archivos adjuntos, la cola de despacho (incluido el report firmado) y las actas de Equipos
- **Teclado en el formulario**: Enter salta al siguiente campo y, en las listas desplegables (cliente, empresa, conductor/RUT, producto), las flechas mueven la selección y Enter elige la opción
- **Resync de Bodegaje en reports despachados**: cuando un super_admin o Javier Navarro edita los productos, cantidades o lotes de un report ya despachado, el stock y los movimientos generados se recalculan automáticamente (vía `rebuild_bodegaje_movimientos()`)
- Exportar listado filtrado a **Excel** (incluye una hoja "Bodegaje - Detalle" con una fila por report × producto)
- Registro de auditoría en cada acción
- Adjuntos (HDS, guía de despacho, evidencia fotográfica, firma) se guardan en el bucket privado `reports-firmados` de Supabase Storage
- **Los reports nunca se eliminan, solo se anulan** — no se pierde nada del historial. Botón "Anular" en el detalle (reemplaza al antiguo "Eliminar", bloqueado a nivel de RLS); un report anulado queda en su propia pestaña "Anulados" en la lista (no en "Todos"), congelado para el resto de los usuarios. Si ya estaba despachado, anularlo revierte automáticamente el stock que había movido y borra los movimientos que había generado (para que no se sigan contando en Kardex/HES)
- **Edición total para `super_admin`, Javier Navarro y la cuenta de Recepción**: pueden editar cualquier campo de cualquier report sin importar su estado (incluye despachado y anulado) — incluye poder "Des-anular" un report (restaurarlo exactamente a como estaba antes de anularse; si volvía a "despachado", el stock y los movimientos se regeneran solos). Para el resto de los usuarios, las reglas normales de bloqueo por estado siguen aplicando igual que siempre
  - **Ojo: la lista de editores totales vive en dos lugares** y hay que mantenerlos iguales: la función SQL `es_editor_total_reports()` (manda en RLS y triggers) y la constante `editorTotal` de `src/app/(dashboard)/reports/[id]/page.tsx` (decide si la pantalla se muestra editable). Agregar a alguien solo en uno de los dos lo deja sin poder editar o viendo un formulario que la base rechaza

### Transporte (`/transporte`)

Reports con transporte propio ADP — seguimiento de viajes asociados a reports de recepción/despacho.

### Transporte Incomex (`/transporte-incomex`)

Registro de operaciones de transporte tercerizado por cliente (guía, transportista, conductor, tarifa, costo y facturación en UF) — histórico importado y mantenible desde la propia vista, con exportación a Excel.

### Instalaciones (`/instalaciones`)

Catálogo de bodegas y patios de almacenamiento:

- Alta/edición de instalación: código, tipo (Bodega/Patio), capacidad (texto libre y en toneladas), resolución sanitaria y sustancias/clases IMO autorizadas
- Cards de ocupación por instalación (stock actual vs. capacidad en toneladas, con barra de progreso semántica) e inventario asociado
- **Uso por clase IMO**: barras compactas con el total de toneladas en planta por clase, agregando `inventario_items` de todas las instalaciones
- Exportar catálogo a Excel

### HES (`/hes`)

Hoja de Estadía — cálculo de almacenaje para facturación mensual:

- Selector de cliente, año y mes
- **Valor UF histórico** obtenido automáticamente desde `mindicador.cl/api/uf` — usa el endpoint anual para meses pasados con AbortController de 8s para evitar cuelgues
- **Múltiples tarifas por cliente**: un cliente puede tener varias tarifas activas simultáneas (ej. clase IMO 8 y clase IMO 3). Selector inline en el header cuando existen más de una. `cotizacion_numero` se auto-genera con formato `COT-YYYY-NNN` mediante secuencia PostgreSQL + trigger si se deja vacío
- **Cálculo automático**: stock inicial + movimientos diarios del período → pallet-días → monto en UF
- **Pallets = posiciones**: el HES cuenta los pallets de cada movimiento con `movimientos.posiciones`; solo si un movimiento no trae posiciones (stock inicial agregado y movimientos manuales antiguos) usa `unidades`. Antes sumaba siempre `unidades`, mezclando pallets con cantidad de envases (22 pallets de xantato eran 748 unidades)
- **UTI Chile se factura por posiciones (pallets) y por clase IMO**: almacenaje diario de pallets de IMO 8, IMO 5 y carga normal (la cantidad es la suma del stock de cada día), más ingreso/salida de pallets y servicios (picking, paletizado, traslados, habilitación). Cada pallet cuenta **1 posición, en la clase más cara que contiene** (`uti_tarifa_clase()`); los reports de UTI calculan las posiciones solos (ver Reports)
- **Día de corte de facturación por cliente** (`clientes.dia_corte_facturacion`): con corte 1 el período es el mes calendario; con otro día es un ciclo rodante (ej. corte 26 → "Septiembre" va del 26 de agosto al 25 de septiembre, como PROQUIMIN y ENAP)
- **Facturación mínima una vez por cliente** en modo unificado (varias tarifas/clases activas): se aplica el máximo de los mínimos configurados sobre el total sumado, en vez de un mínimo independiente por clase
- Tabla día a día con ingresos, despachos, stock al cierre y tarifa
- **Servicios manuales pendientes de tarifa**: si un operador escribió un servicio a mano en un report (fuera del catálogo del cliente), aparece acá agrupado por nombre con la cantidad de veces que se usó en el período — botón "Tarificar" abre el mismo diálogo de servicios, precargado con el nombre, y al guardar queda en el catálogo del cliente para siempre (no solo para este HES)
- Exportar a **Excel** y **PDF** (resumen y detalle) con formato HES oficial ADP
- **Envío por correo** del HES generado (Resend, template de marca ADP) al contacto comercial del cliente, con folio y adjuntos
- Corrección de rango de fechas: usa `.lt(nextMonth.toISOString())` para incluir todos los movimientos del último día del mes

### Inicio y analítica (`/dashboard`)

Desde que se fusionó el módulo Analítica (`/reportes`, eliminado), el Inicio reúne el resumen y las estadísticas:

- KPIs del mes (unidades en bodega, ingresos, despachos, clientes activos) y gráfico de actividad mensual (6, 9 o 12 meses).
- Analítica del período, con selector mensual/anual, mes y año: **Cargas más activas**, **Clientes más activos** y **Distribución por área** (entradas/salidas). Los datos salen de `useAnalitica` (`src/hooks/use-analitica.ts`) y las tarjetas de `src/components/dashboard/analitica-cards.tsx`.
- **Exportar PDF** analítico del período (`src/components/analitica/`, `src/lib/download-analitica-pdf.ts`).
- Las tarjetas "Movimientos recientes", "Ocupación por área" y "Alertas" del Inicio se retiraron.

### Cotizaciones (`/cotizaciones`)

Módulo de cotizaciones, migrado desde el portal anterior ("Gestión de OC y Cotizaciones"). Solo `super_admin`.

- **Lista**: número, fecha, emisor, cliente, atención, valor UF y total. Búsqueda (N° exacto, atención, emisor y cliente), filtro por emisor y por rango de fechas, ordenamiento por cualquier columna y **paginación en el servidor** (25 por página). Botón **Duplicar** por fila para armar una cotización igual a otra
- **Formulario** (`/cotizaciones/nueva` y `/cotizaciones/[id]`):
  - Emisor (Altos del Puerto, Incomex o Mar Azul), fecha, cliente, valor UF, atención, ciudad y dirección. El cliente se elige con el mismo combobox de buscar/crear de los reports, pero sobre la tabla propia `clientes_cotizacion` (y con opción de eliminar un cliente, con confirmación, solo si no tiene cotizaciones)
  - Valor UF: al crear, se trae automáticamente desde `/api/uf` según la fecha (con reintento); al editar, se conserva el valor guardado
  - Líneas en texto libre: cantidad, **descripción multilínea** (Enter hace salto de línea, la caja crece, sin límite de caracteres), valor UF unitario, valor unitario en pesos (calculado), descuento % y neto. Neto, IVA 19% y total se calculan en el formulario
  - Casilla **"Ocultar Neto/IVA/Total en el PDF"** (`cotizaciones.ocultar_totales`) para cotizaciones que se entregan sin totales
  - Observaciones agrupadas por tipo (transporte, almacenaje, generales), con casillas. Desde el mismo formulario se pueden editar las existentes (cambia el catálogo) y agregar nuevas por tipo
  - Observaciones extras (texto libre). Botón **Duplicar** también en el detalle
- **PDF**: "Ver PDF" abre un visor con dos botones. El PDF de una cotización guardada se genera **en el servidor** (`/api/cotizaciones/[id]/pdf`, con `Content-Disposition`) para que el botón de descarga del visor nativo sugiera el nombre correcto **`Cotización_{N°} {Emisor} - {Cliente}.pdf`** (con un `blob:` el navegador inventa un UUID). Diseño con paleta ADP, logos de Incomex y Altos del Puerto del mismo tamaño, firma del gerente y pie con paginación. Los datos del PDF se arman en un solo lugar (`src/lib/cotizacion-pdf-build.ts`) que usan el formulario y la ruta del servidor; **el neto, IVA y total siempre se recalculan desde las líneas** (las columnas guardadas pueden estar desactualizadas)
- **Subir a SharePoint**: el botón "Subir a SharePoint" del visor sube el PDF a la carpeta del año correspondiente del sitio `PortalADP` (`HES Y COTIZACIONES/COTIZACIONES/COTIZACIONES/<año>`, la carpeta se crea si falta) con el mismo nombre de archivo. Usa Microsoft Graph con una app registration y permiso `Sites.Selected` concedido solo a ese sitio (`src/lib/sharepoint.ts`, ruta `/api/cotizaciones/sharepoint`). Las variables de entorno `SHAREPOINT_*` hay que cargarlas también en Netlify
- **Histórico migrado**: se importaron las **1.543 cotizaciones del portal anterior**, conservando su id (`cotizaciones.id_portal`) y sus líneas. Sus clientes (515, depurados de duplicados) viven en la tabla separada `clientes_cotizacion` para no llenar el módulo de Clientes con empresas que no son del sistema; `cotizaciones.numero` ya no es único porque el portal tenía números repetidos
- **Catálogos** (tablas `items_cotizacion`, `items_cotizacion_categorias`, `observaciones_cotizacion`, `observacion_tipos`): migrados completos desde el portal. Las observaciones se leen desde el formulario; el catálogo de ítems no se usa en las líneas (son texto libre)
- Numeración automática continuando desde el portal (`cotizacion_numero_seq`) 
- **Eliminar**: papelera en el listado y botón "Eliminar" en la ficha, con confirmación; borra la cotización con sus líneas y observaciones (en cascada).

### Tarifado Transporte (`/tarifado-transporte`)

Misma mecánica que Cotizaciones, pero para tarifas escalonadas de transporte según el tramo del valor del diésel (hoja AJUSTADA de `docs/TARIFADO ESCALONADO.xlsx`). Solo `super_admin`.

- **Catálogo** (`tarifado_catalogo`): trayecto, capacidad, UF de referencia pre-alza (se conserva en la base pero ya no se muestra en la grilla ni en el PDF) y 7 valores UF/viaje, uno por tramo de `TRAMOS_DIESEL` (1001-1100 … 1601-1700 CLP). Se carga desde la migración `migration_tarifado_transporte.sql`.
- **Formulario**: igual que el de cotizaciones (emisor, fecha, cliente de `clientes_cotizacion`, atención, ciudad, dirección) más "Tarifas rigen a contar del". Cada tarifa del catálogo tiene una casilla para elegir cuáles se envían al cliente; los valores se pueden ajustar por tarifado (se guardan copiados en `tarifado_lineas`, el catálogo no cambia) y hay "Tarifa manual". El botón **Resaltar** activa un modo en que cada clic sobre una casilla de tramo la marca (o desmarca) en amarillo; los resaltados se guardan en `tarifado_lineas.resaltados` (migración `migration_tarifado_resaltados.sql`) y salen como marcador en el PDF para que el cliente ubique su tarifa. Las observaciones son las 6 de la hoja AJUSTADA (`tarifado_obs_catalogo`, migración `migration_tarifado_observaciones_propias.sql`), marcadas por defecto; más un campo de observaciones extras.
- **PDF**: mismo diseño que el de cotizaciones, en horizontal (`src/components/tarifado-transporte/tarifado-pdf.tsx`), "Ver PDF" guarda el tarifado y lo muestra desde el servidor (`/api/tarifado-transporte/[id]/pdf`, con `Content-Disposition`), así el archivo se llama **`Tarifado_Transp_{N°}_{año} {Emisor} - {Cliente}.pdf`** al guardarlo desde el visor o subirlo a SharePoint (con un `blob:` el navegador inventa un UUID). N° con formato `{N°}_{año}` (`tarifado_numero_seq`, parte en 84). "Subir a SharePoint" en el visor (ruta `/api/tarifado-transporte/sharepoint`, carpeta `SHAREPOINT_TARIFADO_PATH`, por defecto `HES Y COTIZACIONES/COTIZACIONES/TARIFADO TRANSPORTE/<año>`; con el mismo nombre de archivo). **Duplicar** (listado y ficha, `src/lib/tarifado-duplicar.ts`) copia el tarifado guardado con fecha de hoy y N° nuevo, y **Eliminar** lo borra con sus tarifas y observaciones.

### Equipos (`/equipos`)

Registro de notebooks/PCs y tablets entregados al personal. Solo `super_admin`, grupo Administración.

- **Equipo** (`equipos`): tipo, marca, modelo, N° de serie (único si se informa), observaciones y estado (Disponible, Asignado, En reparación, Dado de baja). El estado pasa solo a Asignado/Disponible al entregar/devolver.
- **Encargado** (`equipo_asignaciones`): cada entrega guarda nombre, RUT, cargo, fecha de entrega, devolución y el **acta de responsabilidad firmada** (cualquier tipo de archivo —PDF, Word, imágenes escaneadas—, máx. 25 MB, sin ejecutables, bucket privado `equipos-actas`, solo `super_admin`). Un equipo tiene como máximo una entrega vigente; las anteriores quedan como historial. El acta se puede cargar al entregar o después, y reemplazar. **Cambiar encargado** cierra la entrega vigente en la fecha del traspaso y abre una nueva (con su propia acta y el motivo en observaciones), así el equipo conserva el historial; si abrir la nueva falla, reabre la anterior. **Editar datos** corrige nombre, RUT, cargo, fecha y observaciones de la entrega actual sin crear historial. La ficha muestra el **Historial de encargados** completo, con el actual marcado.
- **Ver, eliminar y fotografiar el acta**: "Ver acta" abre un **visor dentro del sistema** (`VisorArchivo`; PDF e imágenes se ven ahí, Word y otros formatos se descargan). Cada acta cargada se puede **eliminar** (con confirmación; borra también el archivo del almacenamiento) y se puede sacar con la cámara de la tablet (**Foto**)
- **Listado**: pestañas Todos / Notebooks y PCs / Tablets con su contador; tarjetas de resumen de la pestaña (equipos, asignados, disponibles, en reparación y **sin acta firmada**, que al pulsarla filtra esos equipos); búsqueda y filtro por estado. La columna Acta distingue "Cargada" de "Falta".
- **Excel** (`/api/equipos/export`, solo `super_admin`): hoja "Equipos" (con su encargado vigente y si el acta está cargada) y hoja "Historial de entregas".
- Migraciones: `migration_equipos.sql` y `migration_equipos_actas_cualquier_archivo.sql` (quita la restricción de tipo del bucket).

---

### Auditoría (`/auditoria`)

Registro paginado (50/página) de todas las acciones sobre reports, inventario y usuarios:

- Filtros por tipo de acción y búsqueda por descripción
- Columnas: fecha/hora, acción (pill con ícono y color), descripción, usuario y enlace al report
- Acceso restringido a `super_admin` y `operador`

### Configuración (`/configuracion`)

**Tab Perfil:** edición de nombre y cambio de contraseña, y **Mi firma** — firma personal (canvas táctil o imagen arrastrada/seleccionada) que Recepción y el encargado de bodega aplican con un clic a los reports, quedando registrada con fecha, usuario e IP. Si el usuario tiene `must_change_password = true` (contraseña temporal), la tab se abre automáticamente y se bloquea la navegación hasta cambiarla.

**Tab Usuarios** *(solo `super_admin`):*
- Lista de todos los usuarios del sistema con rol y estado
- **Crear usuario**: genera una contraseña temporal (12 caracteres, charset sin ambigüedades) y la envía por correo (Resend, template de marca) junto con el link de acceso — el usuario entra directo, sin depender de un link de invitación. Si el correo falla, la contraseña se muestra en el diálogo para compartirla a mano
- **Primer login forzado**: `must_change_password = true` bloquea la navegación en `/configuracion` (tab Perfil) hasta que el usuario define su propia contraseña — mínimo 8 caracteres, sin requisitos de complejidad
- Activar / desactivar usuario
- Cambiar rol con lista blanca de roles válidos
- Editar permisos de módulos por usuario (incluye Inventario, Instalaciones, Movimientos, Clientes, Servicios, HES, Reports, Despacho, Transporte, Transporte Incomex y Auditoría)
- Eliminar usuario (con protección anti-autoborrado)

**Tab Respaldo** *(solo `super_admin`, exigido también en el servidor):*
- **Copia de seguridad manual**: descarga un ZIP con todas las tablas de la base (un JSON por tabla; la lista sale del esquema, así que las tablas nuevas entran solas), los usuarios de Auth (sin contraseñas) y los archivos del bucket `reports-firmados`, más un `LEEME.txt`. Se arma en el navegador (`fflate`) a partir de rutas paginadas `/api/admin/backup/*`, porque una sola respuesta chocaría con los límites de Netlify. Cada copia queda en Auditoría
- **Respaldo semanal automático a SharePoint**: una función programada de Netlify (`respaldo-semanal`, domingos 05:00 UTC) dispara la función en segundo plano `respaldo-background`, que arma el mismo ZIP en el servidor y lo sube con Microsoft Graph (sesión de carga en trozos) como `respaldo_adp_semanal.zip`, **reemplazando** el de la semana anterior. La tarjeta muestra el estado "en curso" (persistente aunque se salga de la pantalla, vía Auditoría), el último resultado y un botón "Respaldar ahora"
- **Respaldo diario del inventario a SharePoint**: `respaldo-inventario-diario` (todos los días 06:00 UTC) → `respaldo-inventario-background` genera `inventario_adp_diario.xlsx` (hojas *Stock actual*, *Isotanques y contenedores* en bodega y *Movimientos*) y reemplaza el del día anterior en la misma carpeta (`src/lib/backup-inventario.ts`). También tiene botón "Respaldar inventario ahora"
- Ambas funciones se protegen con el secreto `BACKUP_CRON_SECRET` (la ruta `/.netlify/` se excluye del proxy de sesión). Cada ejecución, buena o con error, queda en Auditoría

### Asistente virtual (chatbot)

Botón "Asistente ADP" en la barra superior (entre el buscador y el interruptor de tema; con etiqueta solo en pantallas anchas), disponible en todo el dashboard (`src/components/chatbot/chatbot-widget.tsx`). Un clic abre o cierra el panel de chat, que se despliega bajo la barra, a la derecha. Respaldado por Gemini vía `/api/chatbot`:

- Responde preguntas sobre cómo usar cualquier módulo y guía paso a paso ("¿cómo lleno un report?", "¿dónde veo el historial de un movimiento?")
- Puede consultar datos reales y en vivo del sistema (inventario, reports, clientes, viajes de Transporte ADP) mediante function calling de **solo lectura** (`src/lib/chatbot-tools.ts`)
- **No ejecuta ninguna acción que modifique datos** — si el usuario le pide crear/editar/eliminar/despachar algo, indica en qué módulo y cómo hacerlo manualmente
- La base de conocimiento (`src/lib/chatbot-knowledge.ts`) se envía como system instruction en cada turno y debe mantenerse al día con los módulos/flujos del sistema
- Historial de conversación persistido en `sessionStorage` (por pestaña, no por servidor)

### Correos transaccionales

Todos los correos salen por **Resend** con un template de marca compartido (`src/lib/email-brand.ts`: logo ADP embebido, borde celeste, footer) — Supabase Auth no envía ningún correo propio (los usuarios se crean con `email_confirm: true`):

| Correo | Disparado por | Contenido |
|---|---|---|
| Bienvenida | `/api/admin/create-user` | Credenciales de acceso + contraseña temporal |
| Restablecimos tu contraseña | `/api/auth/forgot-password` | Nueva contraseña temporal (reemplaza el correo nativo de Supabase, que no se puede personalizar sin plan pago) |
| Contraseña actualizada | `/api/auth/clear-password-flag` | Aviso de seguridad tras cualquier cambio de contraseña exitoso |
| HES | `/api/hes/send-email` | HES generado con adjuntos (PDF/Excel) |

---

## API Routes

Todas las rutas verifican sesión (`getUser()`) y rol antes de ejecutar operaciones con `supabaseAdmin`.

| Ruta | Método | Rol requerido | Descripción |
|---|---|---|---|
| `/api/admin/users` | GET | `super_admin` | Listar perfiles |
| `/api/admin/create-user` | POST | `super_admin` | Crear usuario + perfil |
| `/api/admin/update-user` | PATCH | `super_admin` | Cambiar rol, estado o permisos |
| `/api/admin/delete-user` | DELETE | `super_admin` | Eliminar usuario de Auth y profiles |
| `/api/auth/clear-password-flag` | POST | autenticado | Marcar contraseña como cambiada (solo afecta al propio usuario) + correo de aviso |
| `/api/auth/forgot-password` | POST | público | Genera y envía una contraseña temporal por correo (respuesta genérica siempre, evita enumerar correos registrados) |
| `/api/hes/export` | POST | autenticado | Generar Excel HES (valida `mes` 0–11 y `anio` 2020–2100) |
| `/api/hes/folio` | POST | autenticado | Asignar/consultar folio HES para un cliente/período |
| `/api/hes/send-email` | POST | autenticado | Enviar HES generado por correo (Resend) al contacto comercial del cliente |
| `/api/instalaciones/export` | GET | autenticado | Exportar catálogo de instalaciones a Excel |
| `/api/chatbot` | POST | autenticado | Asistente virtual (Gemini) — solo lectura vía function calling, sin acciones que modifiquen datos |
| `/api/cotizaciones/[id]/pdf` | GET | `super_admin` | PDF de una cotización generado en el servidor, con `Content-Disposition` para que la descarga lleve el nombre correcto |
| `/api/cotizaciones/sharepoint` | POST | `super_admin` | Sube el PDF de una cotización a SharePoint (carpeta del año) vía Microsoft Graph |
| `/api/tarifado-transporte/[id]/pdf` | GET | `super_admin` | PDF de un tarifado generado en el servidor, con `Content-Disposition` para que lleve el nombre `Tarifado_Transp_{N°}_{año} {Emisor} - {Cliente}.pdf` |
| `/api/tarifado-transporte/sharepoint` | POST | `super_admin` | Sube el PDF de un tarifado a SharePoint (carpeta del año) vía Microsoft Graph |
| `/api/admin/backup/manifiesto` | GET | `super_admin` | Lista de tablas, archivos del bucket y usuarios de Auth para la copia manual |
| `/api/admin/backup/tabla` | GET | `super_admin` | Hasta 1000 filas de una tabla (ordenadas por clave primaria) |
| `/api/admin/backup/archivos` | POST | `super_admin` | URLs firmadas de un lote de archivos del bucket |
| `/api/admin/backup/registro` | POST | `super_admin` | Deja constancia de la copia manual en Auditoría |
| `/api/admin/backup/sharepoint` | GET / POST | `super_admin` | Estado del respaldo semanal / lanzarlo ahora |
| `/api/admin/backup/inventario` | GET / POST | `super_admin` | Estado del respaldo diario del inventario / lanzarlo ahora |

---

## Design system

El archivo `src/app/globals.css` define el sistema de diseño completo:

```css
/* Paleta ADP */
--color-adp-blue:          #0A4A7F
--color-adp-blue-mid:      #1A5276
--color-adp-celeste:       #29ABE2
--color-adp-celeste-light: #E8F7FD

/* Estados semánticos */
--color-status-success-*   /* verde  — completado, activo, normal   */
--color-status-warning-*   /* ámbar  — en proceso, pendiente, bajo  */
--color-status-danger-*    /* rojo   — crítico, inactivo, error     */
--color-status-info-*      /* azul   — información, Bodega IMO      */
--color-status-neutral-*   /* gris   — borrador, neutro             */
```

Clases de utilidad (`@layer utilities`):

```
.badge-success   .badge-warning   .badge-danger   .badge-info   .badge-neutral
.kpi-value       .section-label   .delta-up       .delta-down
```

---

## Estructura de archivos relevantes

```
src/
├── app/
│   ├── globals.css                    # Design system ADP
│   ├── layout.tsx                     # Root layout (fonts, theme)
│   ├── (auth)/login/                  # Login con Supabase Auth
│   ├── api/
│   │   ├── admin/                     # Gestión de usuarios (service role)
│   │   ├── auth/                      # Helpers de autenticación
│   │   ├── cotizaciones/              # PDF en servidor + subida a SharePoint
│   │   └── hes/export/                # Generación de Excel HES
│   └── (dashboard)/
│       ├── layout.tsx                 # Sidebar + topbar
│       ├── dashboard/                 # Vista general
│       ├── inventario/                # Control de stock
│       ├── movimientos/               # Ingresos y despachos
│       ├── clientes/                  # Directorio de clientes
│       ├── servicios/                 # Servicios por cliente
│       ├── reports/
│       │   ├── page.tsx               # Lista de reports
│       │   ├── nuevo/                 # Crear report
│       │   ├── [id]/                  # Detalle / edición
│       │   └── despacho/              # Cola de despacho
│       ├── hes/                       # Hoja de estadía
│       ├── transporte/                # Reports con transporte propio
│       ├── transporte-incomex/        # Transporte tercerizado por cliente
│       ├── instalaciones/             # Bodegas/patios y uso por clase IMO
│       ├── cotizaciones/              # Cotizaciones (lista, formulario con [id])
│       ├── auditoria/                 # Log de acciones
│       └── configuracion/             # Perfil y gestión de usuarios
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── page-header.tsx
│   ├── cotizaciones/
│   │   ├── cotizacion-pdf.tsx         # Plantilla PDF de cotización
│   │   └── cotizacion-preview-modal.tsx # Visor del PDF con descarga
│   ├── chatbot/
│   │   └── chatbot-widget.tsx         # Botón del asistente en el topbar + panel de chat (solo lectura, sin acciones)
│   ├── reports/
│   │   ├── report-pdf.tsx             # Plantilla PDF (secciones N/A, sello INGRESADO/DESPACHADO, tabla de Bodegaje)
│   │   ├── report-form-sections.tsx   # Secciones reutilizables del formulario
│   │   ├── report-form-widgets.tsx    # BodegajeItemsList, EmpresaTransporteCombobox, etc.
│   │   ├── report-form-types.ts       # Tipos y mapper DB → form
│   │   └── report-preview-modal.tsx   # Modal de previsualización/descarga del PDF
│   ├── confirmar-dialogo.tsx          # Confirmación con el diseño de la web (reemplaza window.confirm)
│   ├── visor-archivo.tsx              # Visor de PDF / imagen dentro del sistema (actas de Equipos)
│   ├── tomar-foto-boton.tsx           # Botón que abre la cámara directamente (tablet / celular)
│   └── ui/                            # Componentes shadcn/ui
├── contexts/auth-context.tsx          # Sesión y perfil de usuario
├── proxy.ts                           # Protección de rutas + control de roles (Next.js 16)
├── types/
│   ├── auth.ts                        # UserRole, Profile, ROLE_ROUTES
│   └── database.ts                    # Tipos de tablas Supabase
└── lib/
    ├── supabase.ts                    # Cliente Supabase (browser)
    ├── supabase-server.ts             # Cliente Supabase (SSR)
    ├── supabase-admin.ts              # Cliente con service role key
    ├── audit.ts                       # logAudit() / logAuditServer()
    ├── email-brand.ts                 # Template de correo compartido (logo, colores, botón)
    ├── temp-password.ts               # Generador de contraseña temporal
    ├── download-report-pdf.tsx        # Genera y descarga el PDF
    ├── export-reports-excel.ts        # Exporta reportes a Excel
    ├── report-bodegaje.ts             # cargarBodegajeItems() — productos de la Sección 3
    ├── firma-hash.ts                  # Huella SHA-256 del contenido firmable de un report
    ├── cotizacion-pdf-build.ts        # Arma los datos del PDF de cotización (formulario y ruta del servidor); recalcula totales
    ├── sharepoint.ts                  # Microsoft Graph: token, carpetas por año y subida de archivos a SharePoint (incluye sesión de carga en trozos para archivos grandes)
    ├── backup-core.ts                 # Genera el ZIP del respaldo (tablas, archivos, usuarios) y registra en Auditoría; sin dependencias de Next
    ├── backup-inventario.ts           # Genera el Excel diario del inventario
    ├── backup-servidor.ts             # Verifica super_admin en las rutas /api/admin/backup/*
    ├── auth-reintento.ts              # getUser() con reintentos ante fallos de red (proxy y layout del dashboard)
    ├── inventario.ts                  # Helpers de inventario: partesProducto, detallePorPallet / detalleConRack, valoresPallet (pallets "401/403")
    ├── sigla.ts                       # Formato XXXXXX-X de siglas de contenedor / isotanque
    ├── chatbot-knowledge.ts           # Base de conocimiento (system prompt) del asistente
    ├── chatbot-tools.ts               # Function calling de solo lectura para el asistente
    └── excel.ts                       # Helper genérico exportToExcel()
```

---

## Scripts SQL (`supabase/`)

Todo lo que se ejecuta en el SQL Editor de Supabase está ordenado en carpetas, con un índice completo por tema en [`supabase/README.md`](supabase/README.md):

| Ruta | Descripción |
|---|---|
| `schema.sql` | Esquema completo de la base de datos (tablas, funciones, RLS, triggers) — solo para armar una base desde cero |
| `migraciones_aplicadas/` | Cambios de **esquema** ya ejecutados en producción (~110 `migration_*.sql` y `supabase_security_fixes.sql`): tablas, columnas, funciones, triggers, políticas e índices |
| `cargas_de_datos/` | Cargas y correcciones puntuales de **datos** ya ejecutadas: inventarios de UTI Chile y Wilhelmsen, arreglos de reports puntuales, reinicio de correlativos |
| `demo/` | Datos de demostración (`demo_data.sql`, `demo_data_hes.sql`) y su limpieza (`demo_data_cleanup.sql`, ejecutar antes de pasar a producción) |

Migraciones recientes que conviene conocer (todas en `migraciones_aplicadas/`):

| Archivo | Descripción |
|---|---|
| `migration_movimientos_sync_solo_stock.sql` | El trigger de stock de `movimientos` solo se dispara al cambiar tipo, unidades, posiciones o producto: editar un texto (lote, bodega, nombre) ya no recalcula el stock |
| `migration_movimientos_rack.sql` | Columna `movimientos.rack` (UTI Chile) |
| `migration_reports_bodegaje_pallet_rack.sql` | `report_bodegaje_items.sec3_numero_pallet` / `sec3_rack`; el movimiento copia pallet y rack |
| `migration_uti_posiciones_clase_mas_cara.sql` | Función `uti_tarifa_clase()` y corrección de la carga de UTI: 1 posición por pallet, en su clase más cara |
| `migration_reports_uti_posiciones_automaticas.sql` | `rebuild_bodegaje_movimientos()` calcula las posiciones por pallet de UTI (para el HES) |
| `migration_reports_despacho_parcial.sql` | `sec1_almacenaje = 'parcial'`, `reports.sec2_parcial` y la rama del contenedor entero solo para Full/Vacío |
| `migration_equipos_actas_cualquier_archivo.sql` | El bucket `equipos-actas` acepta cualquier tipo de archivo (25 MB) |
| `migration_reports_sec3_imagenes_referencia.sql` | `reports.sec3_imagenes_referencia` (imágenes de referencia de la Sección 3) |
| `migration_equipos.sql` | Módulo Equipos: tablas, RLS y bucket privado `equipos-actas` |

> **Nota de despliegue:** para aplicar cambios a una base existente (no desde cero), ejecutar solo los bloques delta en el SQL Editor de Supabase — no correr `schema.sql` completo, ya que falla con lo que ya existe. Un cambio nuevo se escribe como `migration_<tema>.sql` en una transacción con verificación al final, se ejecuta una vez y se guarda en `migraciones_aplicadas/` (esquema) o `cargas_de_datos/` (datos).

---

## Base de datos (Supabase)

Tablas principales:

| Tabla | Descripción |
|---|---|
| `clientes` | Directorio de empresas (contacto comercial + hasta 3 operacionales, stock compartido, flag vista Detalle) |
| `servicios_cliente` | Servicios contratados por cliente |
| `tarifas_cliente` | Tarifas de almacenaje por cliente/período/clase IMO |
| `inventario_items` | Ítems en bodega con stock y mínimos |
| `movimientos` | Ingresos y despachos de carga (incluye datos de manifiesto: código/SKU, IMO, NU, CAS, lote, envase, posiciones, N° de pallet, guía, OC, bodega) |
| `reports` | Reports de recepción multi-sección (HDS, guía de despacho, evidencia fotográfica, firma del conductor) |
| `report_bodegaje_items` | Productos de la Sección 3 (Bodegaje) de un report — una fila por producto, con su propia tarifa/manifiesto; inmutable una vez el report está despachado |
| `conductores` | Catálogo de choferes (nombre y RUT, único por RUT) usado en Antecedentes de reports |
| `empresas_transporte` | Catálogo editable de empresas de transporte (Antecedentes del report) — se alimenta también escribiendo un valor nuevo directo en el formulario |
| `transporte_incomex` | Operaciones de transporte tercerizado por cliente |
| `instalaciones_almacenamiento` / `instalacion_sustancias` | Catálogo de bodegas/patios y sustancias/clases IMO autorizadas por instalación |
| `hes_folios` | Folios correlativos de HES generados por cliente/período |
| `profiles` | Perfiles de usuario (rol, permisos, nombre) |
| `audit_logs` | Registro de acciones de usuarios |
| `items_cotizacion_categorias` / `items_cotizacion` | Catálogo de ítems de cotización (nombre, valor base, categoría) |
| `observacion_tipos` / `observaciones_cotizacion` | Catálogo de observaciones de cotización (texto, tipo) |
| `cotizaciones` / `cotizacion_lineas` / `cotizacion_observaciones` | Cotizaciones emitidas (incluye las 1.543 migradas del portal, con `id_portal`), sus líneas y las observaciones seleccionadas (solo `super_admin`) |
| `clientes_cotizacion` | Clientes propios del módulo de Cotizaciones (separados de `clientes`); `cliente_id` opcional enlaza con el cliente real cuando coincide por nombre |

Función RPC:

| Función | Parámetros | Descripción |
|---|---|---|
| `update_stock` | `item_id uuid, delta int` | Actualización atómica de `stock_actual`; usada en movimientos y reports para garantizar consistencia |

---

## Rendimiento

- **Sesión sin viaje a Auth**: `proxy.ts` y el layout del dashboard verifican la sesión con `getClaims()` (firma del JWT validada en local con la clave pública ES256 del proyecto, `src/lib/auth-reintento.ts`); si no hay claims válidos confirman con `getUser()`. Costo: una sesión revocada en otro equipo vale hasta que venza el token (≤1 h); un perfil desactivado se detecta al instante. Las rutas `/api` que escriben datos siguen usando `getUser()`.
- **Perfil sin repetir**: el layout ya lee el perfil para validar la cuenta y se lo pasa al `AuthProvider` (`initialProfile`), que ya no pide `getUser()` ni el perfil al cargar.
- **Listas completas**: PostgREST corta en silencio a 1.000 filas; las consultas sin paginación de movimientos, inventario y analítica usan `fetchTodas` (`src/lib/fetch-todas.ts`), que pide páginas hasta agotar.
- **RLS**: `migration_rls_initplan.sql` envuelve `current_user_role()` y `auth.uid()` en `(select ...)` para evaluarlos una vez por consulta y no por fila.
- Catálogos en caché de memoria con `consultaCacheada` (`src/lib/cache-consultas.ts`) y consultas independientes en paralelo con `Promise.all`.

---

## Despliegue en Netlify

El proyecto está configurado para desplegarse en Netlify usando `@netlify/plugin-nextjs`:

1. Conectar el repositorio `DavidSilva31/web_gestionadp` en Netlify
2. Configurar las variables de entorno (ver arriba) en **Site Settings → Environment variables**
3. Actualizar en Supabase la **Site URL** y **Redirect URLs** con el dominio de producción
4. El deploy se dispara automáticamente con cada push a `main`

El archivo `netlify.toml` en la raíz del proyecto define la configuración de build y el plugin.

**Funciones de Netlify** (`netlify/functions/`, corren en Node 20): `respaldo-semanal` y `respaldo-inventario-diario` (programadas, solo disparan) y `respaldo-background` / `respaldo-inventario-background` (hasta 15 min; hacen el trabajo y suben a SharePoint). Necesitan las variables `SHAREPOINT_*`, `SHAREPOINT_BACKUP_PATH` (opcional) y `BACKUP_CRON_SECRET`, y un redespliegue tras crear o cambiar una variable. `supabase-admin.ts` crea el cliente con un `transport` de relleno cuando no hay `WebSocket` nativo (Node 20), y los imports de esas funciones son relativos porque se empaquetan con esbuild.

---

## AI Skills (`.agents/skills/`)

Skills instaladas vía `npx autoskills` para asistir al desarrollo con Claude Code:

`supabase-postgres-best-practices` · `next-best-practices` · `next-cache-components` · `next-upgrade` · `shadcn` · `react-best-practices` · `composition-patterns` · `typescript-advanced-types` · `nodejs-backend-patterns` · `nodejs-best-practices` · `tailwind-css-patterns` · `frontend-design` · `accessibility` · `seo`

---

## Responsividad

El sistema está optimizado para escritorio y tablet. Mejoras mobile implementadas:

- **Topbar**: botón 🔍 en mobile despliega buscador global inline con resultados y cierre — cubre clientes, inventario, movimientos, reports, transporte incomex e instalaciones
- **HES**: paneles se apilan en mobile; flecha ← para volver a la lista de clientes desde el detalle
- **Reports**: estadísticas en grid responsive; tabs de filtro muestran solo íconos en pantallas pequeñas
- **Movimientos**: botones del header colapsados a ícono en mobile; buscador de ancho flexible
- **Tablas de Reports, Transporte e Inventario**: scroll horizontal propio (`overflow-x-auto` + `min-width`) y columnas rebalanceadas — antes los encabezados se solapaban y el contenido se cortaba sin forma de verlo en tablet/mobile
- El sidebar es colapsable a modo ícono (`collapsible="icon"`) con tooltips en cada opción; al colapsarlo queda solo el ícono ADP y los íconos. En mobile se abre con hamburguesa en la topbar

---

## Screenshots

El script `generate-screenshots.mjs` en la raíz genera capturas automáticas de las páginas principales usando Puppeteer. Las credenciales se leen del entorno (nunca hardcodeadas):

```bash
# En .env.local:
SCREENSHOT_EMAIL=...
SCREENSHOT_PASSWORD=...

node --env-file=.env.local generate-screenshots.mjs
```

Las imágenes se guardan en `screenshots/`. Requiere que el servidor esté corriendo en `localhost:4400`.

También existe `generate-pdf.mjs`, que genera un PDF de la propuesta comercial a partir de `propuesta_ADP_Gestion.html` (documento interno, no versionado — ver `.gitignore`).
