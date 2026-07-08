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
| `super_admin` | Acceso completo, incluido gestión de usuarios y auditoría |
| `operador` | Acceso completo excepto gestión de usuarios y auditoría |
| `operador_carga` | Solo inventario, reports y cola de despacho |

El proxy (`src/proxy.ts`) protege todas las rutas autenticadas y restringe `/auditoria` y `/configuracion` (tab usuarios) a `super_admin` únicamente, usando `canAccess()` con `ROLE_ROUTES` por rol.

---

## Módulos

### Dashboard (`/dashboard`)

Vista general del estado operativo en tiempo real:

- **4 KPI cards**: stock total en bodega, ingresos del mes, despachos del mes y clientes activos — con variación porcentual respecto al mes anterior
- **Gráfico de barras** de actividad mensual (últimos 6, 9 o 12 meses)
- **Movimientos recientes**: últimos 5 registros con tipo, cliente, cantidad y estado
- **Ocupación por área**: barras de progreso relativo por zona (Bodega IMO, Zona Isotanques, Zona RESPEL, Bodega General)
- **Panel de alertas**: ítems sin stock (crítico), bajo stock mínimo (advertencia) y movimientos en proceso (info)
- Banner de error con botón "Reintentar" si la carga de datos falla

### Inventario (`/inventario`)

Control de ítems almacenados por cliente:

- Panel izquierdo con lista de clientes; panel derecho con ítems del cliente seleccionado
- Columnas: código (ALM-001), descripción, área, categoría, stock actual, unidad y estado (Normal / Bajo / Crítico)
- Alta de ítems con stock inicial; edición de metadatos (el stock solo cambia vía movimientos)
- Baja lógica (`activo = false`)
- Exportar inventario del cliente a Excel
- Indicadores de estado semánticos por cliente y por ítem

### Movimientos (`/movimientos`)

Registro de ingresos y despachos de carga:

- Filtro por tipo (todos / ingreso / despacho) y por año (2024–actual)
- **4 stat cards**: total, ingresos, despachos y en proceso
- Tabla con: código (MOV-001), servicio, cliente/carga, área, fecha y estado
- Crear nuevo movimiento (ingreso o despacho) con validación de stock atómica: si el RPC `update_stock` falla se hace rollback del INSERT
- Marcar "En proceso" → "Completado" desde la tabla
- Exportar tabla filtrada a Excel

### Clientes (`/clientes`)

Directorio de empresas con carga en bodega:

- Búsqueda por nombre o RUT
- Alta, edición y desactivación de clientes
- Sector económico con badges de color

### Servicios (`/servicios`)

Gestión de servicios contratados por cliente:

- Lista de clientes con contador de servicios activos (badge actualizado desde DB)
- Formulario inline para crear, editar y eliminar servicios
- Campos: nombre, descripción, tarifa (UF), unidad, orden

### Reports (`/reports`)

Informes de recepción de carga:

- Lista con tabs: Todos / Pendiente despacho / Despachados / Borradores
- **Crear report** (`/reports/nuevo`): formulario multi-sección con tabs navegables:
  - Antecedentes (cliente, patente, conductor)
  - Sección 1 — Depósito de contenedores
  - Sección 2 — Consolidado / Desconsolidado / Otros
  - Sección 3 — Bodegaje (vinculado a ítem de inventario)
- **Detalle** (`/reports/[id]`): vista y edición completa; al pasar borrador → pendiente_despacho llama `update_stock` con rollback si falla
- **Cola de despacho** (`/reports/despacho`): cards expandibles con upload de documento firmado y confirmación de salida de vehículo
- Exportar report individual a **PDF**
- Exportar listado filtrado a **Excel**
- Registro de auditoría en cada acción

### HES (`/hes`)

Hoja de Estadía — cálculo de almacenaje para facturación mensual:

- Selector de cliente, año y mes
- **Valor UF del día** obtenido automáticamente desde `mindicador.cl/api/uf` al cargar la página
- Tarifa de almacenaje por cliente (UF/unidad/día) configurable inline
- **Cálculo automático**: stock inicial + movimientos diarios del período → pallet-días → monto en UF
- Tabla día a día con ingresos, despachos, stock al cierre y tarifa
- Exportar a **Excel** con formato HES oficial de ADP
- Corrección de rango de fechas: usa `.lt(nextMonth.toISOString())` para incluir todos los movimientos del último día del mes

### Analítica (`/reportes`)

Estadísticas y analítica operacional:

- KPIs del mes actual vs. mes anterior (movimientos, entradas, salidas, clientes activos)
- Gráfico de barras mensual para el año en curso
- Top 5 cargas por volumen de movimientos (con desglose entrada/salida)
- Top 5 clientes por actividad
- **Exportar PDF** vía `window.print()` con estilos de impresión que ocultan sidebar, topbar y botones

### Auditoría (`/auditoria`)

Registro paginado (50/página) de todas las acciones sobre reports, inventario y usuarios:

- Filtros por tipo de acción y búsqueda por descripción
- Columnas: fecha/hora, acción (pill con ícono y color), descripción, usuario y enlace al report
- Acceso restringido a `super_admin` y `operador`

### Configuración (`/configuracion`)

**Tab Perfil:** edición de nombre y cambio de contraseña. Si el usuario tiene `must_change_password = true` (contraseña temporal), la tab se abre automáticamente y se bloquea la navegación hasta cambiarla.

**Tab Usuarios** *(solo `super_admin`):*
- Lista de todos los usuarios del sistema con rol y estado
- Crear usuario: genera contraseña temporal segura (12 caracteres, charset sin ambigüedades) y la muestra copiable
- Activar / desactivar usuario
- Cambiar rol con lista blanca de roles válidos
- Editar permisos de módulos por usuario
- Eliminar usuario (con protección anti-autoborrado)

---

## API Routes

Todas las rutas verifican sesión (`getUser()`) y rol antes de ejecutar operaciones con `supabaseAdmin`.

| Ruta | Método | Rol requerido | Descripción |
|---|---|---|---|
| `/api/admin/users` | GET | `super_admin` | Listar perfiles |
| `/api/admin/create-user` | POST | `super_admin` | Crear usuario + perfil |
| `/api/admin/update-user` | PATCH | `super_admin` | Cambiar rol, estado o permisos |
| `/api/admin/delete-user` | DELETE | `super_admin` | Eliminar usuario de Auth y profiles |
| `/api/auth/clear-password-flag` | POST | autenticado | Marcar contraseña como cambiada (solo afecta al propio usuario) |
| `/api/hes/export` | POST | autenticado | Generar Excel HES (valida `mes` 0–11 y `anio` 2020–2100) |

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
│   │   └── hes/export/                # Generación de Excel HES
│   └── (dashboard)/
│       ├── layout.tsx                 # Sidebar + topbar
│       ├── dashboard/                 # Vista general
│       ├── inventario/                # Control de stock
│       ├── movimientos/               # Ingresos y despachos
│       ├── clientes/                  # Directorio de clientes
│       ├── servicios/                 # Servicios por cliente
│       ├── reportes/                  # Estadísticas y analítica
│       ├── reports/
│       │   ├── page.tsx               # Lista de reports
│       │   ├── nuevo/                 # Crear report
│       │   ├── [id]/                  # Detalle / edición
│       │   └── despacho/              # Cola de despacho
│       ├── hes/                       # Hoja de estadía
│       ├── auditoria/                 # Log de acciones
│       └── configuracion/             # Perfil y gestión de usuarios
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── page-header.tsx
│   ├── reports/
│   │   ├── report-pdf.tsx             # Plantilla PDF
│   │   ├── report-form-sections.tsx   # Secciones reutilizables del formulario
│   │   └── report-form-types.ts       # Tipos y mapper DB → form
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
    ├── download-report-pdf.tsx        # Genera y descarga el PDF
    ├── export-reports-excel.ts        # Exporta reportes a Excel
    └── excel.ts                       # Helper genérico exportToExcel()
```

---

## Scripts SQL (`supabase/`)

| Archivo | Descripción |
|---|---|
| `schema.sql` | Esquema completo de la base de datos (tablas, funciones, RLS, triggers) |
| `demo_data.sql` | Datos de demostración (Brenntag, BASF, Air Liquide) |
| `demo_data_cleanup.sql` | Limpieza de datos demo — ejecutar antes de pasar a producción |
| `supabase_security_fixes.sql` | Fixes de seguridad aplicados (search_path, REVOKE, RLS policies) |

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
| `reports` | Reports de recepción multi-sección |
| `profiles` | Perfiles de usuario (rol, permisos, nombre) |
| `audit_logs` | Registro de acciones de usuarios |

Función RPC:

| Función | Parámetros | Descripción |
|---|---|---|
| `update_stock` | `item_id uuid, delta int` | Actualización atómica de `stock_actual`; usada en movimientos y reports para garantizar consistencia |

---

## Despliegue en Netlify

El proyecto está configurado para desplegarse en Netlify usando `@netlify/plugin-nextjs`:

1. Conectar el repositorio `DavidSilva31/web_gestionadp` en Netlify
2. Configurar las 4 variables de entorno en **Site Settings → Environment variables**
3. Actualizar en Supabase la **Site URL** y **Redirect URLs** con el dominio de producción
4. El deploy se dispara automáticamente con cada push a `main`

El archivo `netlify.toml` en la raíz del proyecto define la configuración de build y el plugin.

---

## AI Skills (`.agents/skills/`)

Skills instaladas vía `npx autoskills` para asistir al desarrollo con Claude Code:

`supabase-postgres-best-practices` · `next-best-practices` · `next-cache-components` · `next-upgrade` · `shadcn` · `react-best-practices` · `composition-patterns` · `typescript-advanced-types` · `nodejs-backend-patterns` · `nodejs-best-practices` · `tailwind-css-patterns` · `frontend-design` · `accessibility` · `seo`

---

## Screenshots

El script `screenshots.mjs` en la raíz genera capturas automáticas de todas las páginas usando Puppeteer:

```bash
ADP_EMAIL=... ADP_PASSWORD=... node screenshots.mjs
```

Las imágenes se guardan en `screenshots_gestion/`. Requiere que el servidor esté corriendo en `localhost:4400`.
