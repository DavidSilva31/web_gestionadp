// Generación de la copia de seguridad en el servidor (ZIP en memoria). Sin dependencias de Next:
// lo usan las rutas de /api/admin/backup y las funciones de Netlify del respaldo semanal
// (por eso los imports son relativos: esas funciones se empaquetan con esbuild).
import { zipSync, strToU8, type Zippable } from "fflate"
import { supabaseAdmin } from "./supabase-admin"

export const BUCKET_FIRMADOS = "reports-firmados"

export type TablaRespaldo = { nombre: string; pk: string[] }

// Tablas del esquema public y sus claves primarias, leídas del OpenAPI de PostgREST,
// así un respaldo siempre incluye las tablas nuevas sin tocar código.
export async function listarTablas(): Promise<TablaRespaldo[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`No se pudo leer el esquema (${res.status})`)
  const spec = await res.json() as {
    definitions?: Record<string, { properties?: Record<string, { description?: string }> }>
  }
  return Object.entries(spec.definitions ?? {})
    .map(([nombre, def]) => ({
      nombre,
      pk: Object.entries(def.properties ?? {})
        .filter(([, p]) => p.description?.includes("<pk/>"))
        .map(([col]) => col),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

// Archivos del bucket (hoy es una carpeta plana, pero recorre subcarpetas por si aparecen).
export async function listarArchivos(prefijo = ""): Promise<{ nombre: string; bytes: number }[]> {
  const out: { nombre: string; bytes: number }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_FIRMADOS).list(prefijo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    for (const f of data ?? []) {
      const ruta = prefijo ? `${prefijo}/${f.name}` : f.name
      if (f.id === null) out.push(...await listarArchivos(ruta))
      else out.push({ nombre: ruta, bytes: Number((f.metadata as { size?: number } | null)?.size ?? 0) })
    }
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}

export async function listarUsuariosAuth() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  // Datos de Auth (sin contraseñas: Supabase no las expone).
  return data.users.map(u => ({
    id: u.id, email: u.email, phone: u.phone, created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at,
    app_metadata: u.app_metadata, user_metadata: u.user_metadata,
    banned_until: (u as { banned_until?: string }).banned_until ?? null,
  }))
}

export type ResumenRespaldo = { tablas: number; filas: number; archivos: number; omitidos: number; bytes: number }

export function textoLeeme(cuentas: Record<string, number>, archivos: number, omitidos: string[]): string {
  return [
    "COPIA DE SEGURIDAD — ADP Gestión",
    `Generada: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
    "",
    "Contenido:",
    "  datos/<tabla>.json            Todos los registros de cada tabla de la base de datos.",
    "  datos/_auth_usuarios.json     Usuarios de acceso (sin contraseñas: Supabase no las entrega).",
    "  archivos/reports-firmados/    Firmas, evidencias y PDF firmados (bucket reports-firmados).",
    "",
    "Registros por tabla:",
    ...Object.entries(cuentas).map(([n, c]) => `  ${n}: ${c}`),
    "",
    `Archivos respaldados: ${archivos - omitidos.length} de ${archivos}`,
    ...(omitidos.length ? ["Archivos que no se pudieron descargar:", ...omitidos.map(o => `  ${o}`)] : []),
    "",
    "Este archivo contiene información sensible de clientes: guárdalo en un lugar seguro.",
  ].join("\r\n")
}

// Arma el ZIP completo (mismo contenido que el respaldo manual del navegador).
export async function generarRespaldoZip(): Promise<{ zip: Uint8Array; resumen: ResumenRespaldo }> {
  const [tablas, archivos, usuarios] = await Promise.all([listarTablas(), listarArchivos(), listarUsuariosAuth()])
  const data: Zippable = {}
  const cuentas: Record<string, number> = {}
  let filasTotal = 0

  for (const t of tablas) {
    const filas: unknown[] = []
    for (let desde = 0; ; desde += 1000) {
      let q = supabaseAdmin.from(t.nombre).select("*")
      for (const col of t.pk) q = q.order(col, { ascending: true })
      const { data: lote, error } = await q.range(desde, desde + 999)
      if (error) throw new Error(`Tabla ${t.nombre}: ${error.message}`)
      filas.push(...(lote ?? []))
      if ((lote?.length ?? 0) < 1000) break
    }
    data[`datos/${t.nombre}.json`] = [strToU8(JSON.stringify(filas, null, 1)), { level: 4 }]
    cuentas[t.nombre] = filas.length
    filasTotal += filas.length
  }
  data["datos/_auth_usuarios.json"] = [strToU8(JSON.stringify(usuarios, null, 1)), { level: 4 }]

  const omitidos: string[] = []
  const cola = [...archivos]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let a = cola.shift(); a; a = cola.shift()) {
      try {
        const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET_FIRMADOS).download(a.nombre)
        if (error || !blob) throw error ?? new Error("vacío")
        // Ya vienen comprimidos (PDF/PNG/JPG): se guardan sin recomprimir.
        data[`archivos/${BUCKET_FIRMADOS}/${a.nombre}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
      } catch (e) {
        console.error("[respaldo] archivo omitido:", a.nombre, e)
        omitidos.push(a.nombre)
      }
    }
  }))

  data["LEEME.txt"] = strToU8(textoLeeme(cuentas, archivos.length, omitidos))
  const zip = zipSync(data)
  return {
    zip,
    resumen: { tablas: tablas.length, filas: filasTotal, archivos: archivos.length - omitidos.length, omitidos: omitidos.length, bytes: zip.byteLength },
  }
}

// Marca en la auditoría que un respaldo a SharePoint está corriendo: la pantalla de Configuración
// lo muestra como "en curso" hasta que aparezca el registro final. Nunca lanza.
export async function auditarInicioRespaldoSharePoint(quien?: { id: string; nombre: string }) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    tabla: "sistema",
    registro_id: "respaldo_sharepoint",
    accion: "sistema.respaldo_sharepoint",
    descripcion: "Respaldo a SharePoint iniciado",
    datos_nuevo: { estado: "en_curso" },
    usuario_id: quien?.id ?? null,
    usuario_nombre: quien?.nombre ?? "Respaldo automático",
  })
  if (error) console.error("[respaldo] no se pudo auditar el inicio:", error)
}

// Registro del respaldo automático en la auditoría (éxito o error). Nunca lanza.
export async function auditarRespaldoSharePoint(ok: boolean, descripcion: string, datos: Record<string, unknown>, quien?: { id: string; nombre: string }) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    tabla: "sistema",
    registro_id: "respaldo_sharepoint",
    accion: "sistema.respaldo_sharepoint",
    descripcion,
    datos_nuevo: { ok, ...datos },
    usuario_id: quien?.id ?? null,
    usuario_nombre: quien?.nombre ?? "Respaldo automático",
  })
  if (error) console.error("[respaldo] no se pudo auditar:", error)
}

// Registro del respaldo diario del inventario en la auditoría (éxito o error). Nunca lanza.
export async function auditarRespaldoInventario(ok: boolean, descripcion: string, datos: Record<string, unknown>, quien?: { id: string; nombre: string }) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    tabla: "sistema",
    registro_id: "respaldo_inventario",
    accion: "sistema.respaldo_inventario",
    descripcion,
    datos_nuevo: { ok, ...datos },
    usuario_id: quien?.id ?? null,
    usuario_nombre: quien?.nombre ?? "Respaldo automático",
  })
  if (error) console.error("[respaldo] no se pudo auditar el inventario:", error)
}
