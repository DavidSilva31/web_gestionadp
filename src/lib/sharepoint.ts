// Subida de archivos a SharePoint vía Microsoft Graph, con credenciales de
// aplicación (client credentials). Solo se usa en rutas de servidor — nunca
// importar desde un componente "use client".

const GRAPH = "https://graph.microsoft.com/v1.0"

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name} (configuración de SharePoint)`)
  return v
}

async function getGraphToken(): Promise<string> {
  const tenant = env("SHAREPOINT_TENANT_ID")
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("SHAREPOINT_CLIENT_ID"),
      client_secret: env("SHAREPOINT_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`No se pudo autenticar con SharePoint: ${json.error_description ?? res.status}`)
  return json.access_token as string
}

async function ensureFolderPath(token: string, siteId: string, parts: string[]) {
  let pathSoFar = ""
  for (const part of parts) {
    const testPath = pathSoFar ? `${pathSoFar}/${part}` : part
    const getRes = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${encodeURIComponent(testPath).replace(/%2F/g, "/")}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (getRes.status === 404) {
      const parentUrl = pathSoFar
        ? `${GRAPH}/sites/${siteId}/drive/root:/${encodeURIComponent(pathSoFar).replace(/%2F/g, "/")}:/children`
        : `${GRAPH}/sites/${siteId}/drive/root/children`
      const createRes = await fetch(parentUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      })
      if (!createRes.ok && createRes.status !== 409) {
        const j = await createRes.json().catch(() => ({}))
        throw new Error(`No se pudo crear la carpeta "${part}" en SharePoint: ${j.error?.message ?? createRes.status}`)
      }
    } else if (!getRes.ok) {
      const j = await getRes.json().catch(() => ({}))
      throw new Error(`No se pudo verificar la carpeta "${testPath}" en SharePoint: ${j.error?.message ?? getRes.status}`)
    }
    pathSoFar = testPath
  }
}

export async function subirArchivoASharePoint(opts: {
  carpetas: string[]
  nombreArchivo: string
  contenido: Buffer
  contentType: string
}): Promise<{ webUrl: string }> {
  const siteId = env("SHAREPOINT_SITE_ID")
  const token = await getGraphToken()
  await ensureFolderPath(token, siteId, opts.carpetas)

  const fullPath = [...opts.carpetas, opts.nombreArchivo].join("/")
  const uploadRes = await fetch(
    `${GRAPH}/sites/${siteId}/drive/root:/${encodeURIComponent(fullPath).replace(/%2F/g, "/")}:/content`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": opts.contentType }, body: new Uint8Array(opts.contenido) }
  )
  const json = await uploadRes.json()
  if (!uploadRes.ok) throw new Error(`No se pudo subir el archivo a SharePoint: ${json.error?.message ?? uploadRes.status}`)
  return { webUrl: json.webUrl as string }
}

// Sube un archivo grande (>4 MB, límite del PUT simple) con una sesión de carga en trozos y
// reemplaza el archivo existente con el mismo nombre: así la carpeta conserva solo la última copia.
export async function subirArchivoGrandeASharePoint(opts: {
  carpetas: string[]
  nombreArchivo: string
  contenido: Uint8Array
}): Promise<{ webUrl: string }> {
  const siteId = env("SHAREPOINT_SITE_ID")
  const token = await getGraphToken()
  await ensureFolderPath(token, siteId, opts.carpetas)

  const fullPath = [...opts.carpetas, opts.nombreArchivo].join("/")
  const sesion = await fetch(
    `${GRAPH}/sites/${siteId}/drive/root:/${encodeURIComponent(fullPath).replace(/%2F/g, "/")}:/createUploadSession`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    }
  )
  const sesionJson = await sesion.json()
  if (!sesion.ok) throw new Error(`No se pudo iniciar la subida a SharePoint: ${sesionJson.error?.message ?? sesion.status}`)

  const total = opts.contenido.byteLength
  const TROZO = 320 * 1024 * 32 // múltiplo de 320 KiB, como exige Graph (~10 MB)
  for (let inicio = 0; inicio < total; inicio += TROZO) {
    const fin = Math.min(inicio + TROZO, total)
    const res = await fetch(sesionJson.uploadUrl as string, {
      method: "PUT",
      headers: { "Content-Length": String(fin - inicio), "Content-Range": `bytes ${inicio}-${fin - 1}/${total}` },
      body: opts.contenido.slice(inicio, fin),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Falló la subida a SharePoint (bytes ${inicio}-${fin}): ${json.error?.message ?? res.status}`)
    if (fin === total) return { webUrl: json.webUrl as string }
  }
  throw new Error("La subida a SharePoint no terminó")
}
