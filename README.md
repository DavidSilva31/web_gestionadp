# ADP Gestión

Sistema de gestión interna para las operaciones de bodega de **Altos del Puerto** (Camino La Pólvora 106, Valparaíso). Permite registrar movimientos de carga, controlar inventario, administrar clientes, emitir reportes de recepción y calcular hojas de estadía (HES) para facturación.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | Tailwind CSS v4 + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth) |
| PDF | @react-pdf/renderer |
| Excel | ExcelJS + xlsx |
| Gráficos | Recharts |
| Fonts | DM Sans + Inter (next/font) |

## Requisitos

- Node.js 20+
- Proyecto Supabase configurado con las tablas correspondientes
- Archivo `.env.local` con las variables de entorno (ver abajo)

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Instalación y ejecución

```bash
npm install
npm run dev        # http://localhost:4400
npm run build
npm run start
```

---

## Módulos

### Dashboard (`/dashboard`)

Vista general del estado operativo en tiempo real:

- **4 KPI cards**: stock total en bodega, ingresos del mes, despachos del mes y clientes activos — con variación porcentual respecto al mes anterior
- **Tabla de movimientos recientes**: últimos 5 registros con tipo, cliente, carga, cantidad y estado
- **Panel de alertas**: ítems sin stock (crítico), bajo stock mínimo (advertencia) y movimientos en proceso (info)
- **Ocupación por área**: barras de progreso relativo por zona de bodega (Bodega IMO, Zona Isotanques, Zona RESPEL, Bodega General)
- Estado del sistema en el encabezado (operativo / alertas activas)

### Inventario (`/inventario`)

Control de ítems almacenados por área:

- Listado filtrable por área y búsqueda por texto
- Columnas: descripción, área, stock actual, stock mínimo, unidad, estado (Normal / Bajo / Crítico)
- Alta, edición y baja de ítems mediante dialog inline
- Badges de estado semánticos: verde (Normal), ámbar (Bajo), rojo (Crítico)

### Movimientos (`/movimientos`)

Registro de ingresos y despachos de carga:

- **4 stat cards**: total de registros, ingresos, despachos y movimientos en proceso
- Tabla filtrable por tipo, área, servicio y búsqueda por texto
- Columnas: código (MOV-001), tipo con ícono, cliente, carga, unidades, área, servicio, fecha y estado
- Crear nuevo movimiento (ingreso o despacho) mediante dialog con campos: cliente, tipo de carga, unidades, área, servicio, fecha, notas
- Marcar "En proceso" → "Completado" con un clic desde la tabla
- Badges de tipo, área y servicio con paleta ADP; estado mediante `badge-success` / `badge-warning`

### Clientes (`/clientes`)

Directorio de empresas con carga en bodega:

- Listado filtrable con búsqueda por nombre o RUT
- Información: nombre, RUT, correo, teléfono, contacto, estado (Activo / Inactivo)
- Alta, edición y desactivación de clientes
- Vista de detalle con servicios contratados asociados

### Servicios (`/servicios`)

Gestión de los servicios contratados por cliente:

- Lista de clientes con sus servicios expandibles
- Cada servicio tiene: nombre, descripción, tarifa (UF), unidad y orden de visualización
- Formulario inline para agregar, editar y eliminar servicios sin salir de la página
- Búsqueda por cliente

### Reports (`/reports`)

Informes de recepción de carga (reportes de entrada/despacho):

- Lista con tabs por estado: Todos / Pendiente despacho / Despachados / Borradores
- Columnas: número, cliente, patente, conductor, fecha, secciones activas y estado
- **Crear reporte** (`/reports/nuevo`): formulario multi-sección con:
  - Sección 1 — Depósito de contenedores
  - Sección 2 — Consolidado / otros
  - Sección 3 — Despacho
- **Detalle de reporte** (`/reports/[id]`): vista y edición completa del informe
- **Despacho** (`/reports/despacho`): flujo de despacho con confirmación
- Exportar reporte individual a **PDF** (generado en cliente con @react-pdf/renderer)
- Exportar listado filtrado a **Excel**
- Importar reportes desde Excel (subida de archivo)
- Registro de auditoría en cada acción sobre reportes

### HES (`/hes`)

Hoja de Estadía — cálculo de almacenaje para facturación mensual:

- Selector de cliente, año y mes
- Carga de tarifa de almacenaje por cliente (en UF por unidad/día)
- **Cálculo automático** de pallet-días basado en movimientos del período:
  - Stock inicial (movimientos anteriores al período)
  - Log diario: ingresos, despachos, stock al cierre y tarifa del día
  - Total de pallet-días y monto en UF
- Vista de tabla día a día con operador, guías de entrada/salida, reportes asociados y stock
- Exportar a **Excel** con el formato de HES oficial de ADP
- Modo de edición manual de tarifas por cliente

### Auditoría (`/auditoria`)

Registro de acciones sobre reportes (quién, qué y cuándo).

### Configuración (`/configuracion`)

Ajustes del perfil y preferencias del usuario.

---

## Design system

El archivo `src/app/globals.css` define el sistema de diseño completo:

```css
/* Paleta ADP */
--color-adp-blue:         #0A4A7F
--color-adp-blue-mid:     #1A5276
--color-adp-celeste:      #29ABE2
--color-adp-celeste-light:#E8F7FD

/* Estados semánticos */
--color-status-success-*  /* verde — completado, activo, normal */
--color-status-warning-*  /* ámbar — en proceso, pendiente, bajo stock */
--color-status-danger-*   /* rojo  — crítico, inactivo, error */
--color-status-info-*     /* azul  — información, bodega IMO */
--color-status-neutral-*  /* gris  — borrador, neutro */
```

Clases de utilidad disponibles (Tailwind v4 `@layer utilities`):

```
.badge-success   .badge-warning   .badge-danger   .badge-info   .badge-neutral
.kpi-value       .section-label   .delta-up       .delta-down
```

---

## Estructura de archivos relevantes

```
src/
├── app/
│   ├── globals.css                   # Design system ADP
│   ├── layout.tsx                    # Root layout (fonts, theme)
│   ├── (auth)/login/                 # Login con Supabase Auth
│   └── (dashboard)/
│       ├── layout.tsx                # Sidebar + topbar
│       ├── dashboard/                # Vista general
│       ├── inventario/               # Control de stock
│       ├── movimientos/              # Ingresos y despachos
│       ├── clientes/                 # Directorio de clientes
│       ├── servicios/                # Servicios por cliente
│       ├── reports/                  # Reportes de recepción
│       │   ├── page.tsx              # Lista de reportes
│       │   ├── nuevo/                # Crear reporte
│       │   ├── [id]/                 # Detalle / edición
│       │   └── despacho/             # Flujo de despacho
│       ├── hes/                      # Hoja de estadía
│       ├── auditoria/                # Log de acciones
│       └── configuracion/            # Perfil y ajustes
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── page-header.tsx
│   ├── reports/report-pdf.tsx        # Plantilla PDF con @react-pdf/renderer
│   └── ui/                           # Componentes shadcn/ui
├── contexts/auth-context.tsx         # Sesión y perfil de usuario
└── lib/
    ├── supabase.ts                   # Cliente Supabase
    ├── audit.ts                      # Función logAudit()
    ├── download-report-pdf.tsx       # Genera y descarga el PDF
    └── export-reports-excel.ts       # Exporta reportes a Excel
```

---

## Base de datos (Supabase)

Tablas principales:

| Tabla | Descripción |
|---|---|
| `clientes` | Directorio de empresas |
| `servicios_cliente` | Servicios contratados por cliente |
| `tarifas_cliente` | Tarifas de almacenaje por cliente/período |
| `inventario_items` | Ítems en bodega con stock y mínimos |
| `movimientos` | Ingresos y despachos de carga |
| `reports` | Reportes de recepción multi-sección |
| `audit_log` | Registro de acciones de usuarios |

---

## Screenshots

El script `screenshots.mjs` en la raíz genera capturas automáticas de todas las páginas usando Puppeteer:

```bash
ADP_EMAIL=... ADP_PASSWORD=... node screenshots.mjs
```

Las imágenes se guardan en `screenshots_gestion/`. Requiere que el servidor esté corriendo en `localhost:4400`.
