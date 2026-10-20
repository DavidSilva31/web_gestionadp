"use client"

import { useEffect, useState } from "react"
import { zip, strToU8, type Zippable } from "fflate"
import { AlertTriangle, CheckCircle2, CloudUpload, DatabaseBackup, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

type Manifiesto = {
  tablas: { nombre: string; pk: string[] }[]
  archivos: { nombre: string; bytes: number }[]
  usuarios: unknown[]
}

const LOTE_ARCHIVOS = 20

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
  return body as T
}

function comprimir(data: Zippable): Promise<Uint8Array> {
  // level 0: los PDF/imágenes ya vienen comprimidos; los JSON se comprimen bien por fila, pero
  // un nivel moderado mantiene el zip chico sin bloquear el navegador (fflate usa un worker).
  return new Promise((resolve, reject) => zip(data, { level: 4 }, (err, out) => (err ? reject(err) : resolve(out))))
}

// Copia de seguridad completa del sistema (solo super_admin; las rutas /api/admin/backup lo exigen):
// todas las tablas en JSON, los archivos del bucket reports-firmados y los usuarios de Auth.
// Se arma en el navegador para no chocar con los límites de tiempo/tamaño de respuesta del servidor.
export function CopiaSeguridadCard() {
  const [confirmando, setConfirmando] = useState(false)
  const [corriendo,   setCorriendo]   = useState(false)
  const [progreso,    setProgreso]    = useState("")
  const [pct,         setPct]         = useState(0)
  const [resultado,   setResultado]   = useState<{ ok: boolean; text: string } | null>(null)

  async function respaldar() {
    setConfirmando(false)
    setCorriendo(true)
    setResultado(null)
    setPct(0)
    try {
      setProgreso("Preparando…")
      const man = await pedirJson<Manifiesto>("/api/admin/backup/manifiesto")
      const totalPasos = man.tablas.length + man.archivos.length || 1
      let hecho = 0
      const avanzar = (texto: string) => { hecho++; setProgreso(texto); setPct(Math.round((hecho / totalPasos) * 100)) }

      const zipData: Zippable = {}
      const cuentas: Record<string, number> = {}
      let filasTotal = 0

      for (const t of man.tablas) {
        const filas: unknown[] = []
        for (let desde = 0; ; desde += 1000) {
          const r = await pedirJson<{ filas: unknown[]; fin: boolean }>(
            `/api/admin/backup/tabla?nombre=${encodeURIComponent(t.nombre)}&desde=${desde}`)
          filas.push(...r.filas)
          if (r.fin) break
        }
        zipData[`datos/${t.nombre}.json`] = strToU8(JSON.stringify(filas, null, 1))
        cuentas[t.nombre] = filas.length
        filasTotal += filas.length
        avanzar(`Tabla ${t.nombre} (${filas.length} registros)`)
      }
      zipData["datos/_auth_usuarios.json"] = strToU8(JSON.stringify(man.usuarios, null, 1))

      const omitidos: string[] = []
      let bytes = 0
      for (let i = 0; i < man.archivos.length; i += LOTE_ARCHIVOS) {
        const lote = man.archivos.slice(i, i + LOTE_ARCHIVOS)
        const { urls } = await pedirJson<{ urls: { nombre: string; url: string | null; error: string | null }[] }>(
          "/api/admin/backup/archivos",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombres: lote.map(a => a.nombre) }) })
        await Promise.all(urls.map(async u => {
          try {
            if (!u.url) throw new Error(u.error ?? "sin URL")
            const res = await fetch(u.url)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const buf = new Uint8Array(await res.arrayBuffer())
            // Los archivos ya están comprimidos (PDF/PNG/JPG): se guardan sin recomprimir.
            zipData[`archivos/reports-firmados/${u.nombre}`] = [buf, { level: 0 }]
            bytes += buf.byteLength
          } catch (e) {
            console.error("[respaldo] archivo omitido:", u.nombre, e)
            omitidos.push(u.nombre)
          }
        }))
        hecho += lote.length - 1
        avanzar(`Archivos ${Math.min(i + LOTE_ARCHIVOS, man.archivos.length)} de ${man.archivos.length}`)
      }

      const ahora = new Date()
      const stamp = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}_${String(ahora.getHours()).padStart(2, "0")}${String(ahora.getMinutes()).padStart(2, "0")}`
      zipData["LEEME.txt"] = strToU8([
        "COPIA DE SEGURIDAD — ADP Gestión",
        `Generada: ${ahora.toLocaleString("es-CL")}`,
        "",
        "Contenido:",
        "  datos/<tabla>.json            Todos los registros de cada tabla de la base de datos.",
        "  datos/_auth_usuarios.json     Usuarios de acceso (sin contraseñas: Supabase no las entrega).",
        "  archivos/reports-firmados/    Firmas, evidencias y PDF firmados (bucket reports-firmados).",
        "",
        "Registros por tabla:",
        ...Object.entries(cuentas).map(([n, c]) => `  ${n}: ${c}`),
        "",
        `Archivos respaldados: ${man.archivos.length - omitidos.length} de ${man.archivos.length}`,
        ...(omitidos.length ? ["Archivos que no se pudieron descargar:", ...omitidos.map(o => `  ${o}`)] : []),
        "",
        "Este archivo contiene información sensible de clientes: guárdalo en un lugar seguro.",
      ].join("\r\n"))

      setProgreso("Comprimiendo…")
      const out = await comprimir(zipData)
      const blob = new Blob([out as BlobPart], { type: "application/zip" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `respaldo_adp_${stamp}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      fetch("/api/admin/backup/registro", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tablas: man.tablas.length, filas: filasTotal, archivos: man.archivos.length - omitidos.length,
          bytes: out.byteLength, omitidos: omitidos.length,
        }),
      }).catch(() => {})

      setPct(100)
      setResultado({
        ok: omitidos.length === 0,
        text: `Copia descargada: ${man.tablas.length} tablas, ${filasTotal} registros y ${man.archivos.length - omitidos.length} archivos (${(out.byteLength / 1048576).toFixed(1)} MB).`
          + (omitidos.length ? ` ${omitidos.length} archivos no se pudieron descargar (detalle en LEEME.txt).` : ""),
      })
    } catch (err) {
      console.error("[respaldo] error:", err)
      setResultado({ ok: false, text: `No se pudo completar la copia: ${err instanceof Error ? err.message : "error desconocido"}` })
    } finally {
      setCorriendo(false)
      setProgreso("")
    }
  }

  return (
    <div className="space-y-4">
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b">
        <DatabaseBackup className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Copia de seguridad</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Descarga un ZIP con toda la información del sistema: base de datos, usuarios y archivos adjuntos.
      </p>

      {corriendo && (
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{progreso} · {pct}%</p>
        </div>
      )}

      {resultado && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${resultado.ok
          ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {resultado.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{resultado.text}</span>
        </div>
      )}

      <Button onClick={() => setConfirmando(true)} disabled={corriendo} className="gap-2">
        {corriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {corriendo ? "Generando copia…" : "Hacer copia de seguridad"}
      </Button>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Hacer copia de seguridad</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se descargará un ZIP con todos los datos y archivos del sistema. Puede tardar un par de minutos;
            no cierres esta pestaña hasta que termine. El archivo contiene información sensible: guárdalo en un lugar seguro.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button onClick={respaldar} className="gap-2"><Download className="h-4 w-4" />Comenzar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <RespaldoSharePointCard />
    <RespaldoInventarioCard />
    </div>
  )
}

type EstadoSP = {
  configurado: boolean
  enCurso: { desde: string; por: string | null } | null
  ultimo: { fecha: string; ok: boolean; descripcion: string | null; por: string | null } | null
}

// Respaldo semanal automático a SharePoint (lo ejecuta una función programada de Netlify):
// muestra el resultado de la última ejecución y permite lanzarlo a mano.
function RespaldoSharePointCard() {
  const [estado, setEstado] = useState<EstadoSP | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const cargar = () => pedirJson<EstadoSP>("/api/admin/backup/sharepoint").then(setEstado).catch(() => {})
  useEffect(() => { cargar() }, [])

  // Mientras hay un respaldo corriendo (incluso si el usuario salió y volvió a esta pantalla)
  // se consulta el estado cada 5 s; al terminar aparece el resultado solo.
  const enCurso = !!estado?.enCurso
  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(cargar, 5000)
    return () => clearInterval(t)
  }, [enCurso])

  async function ahora() {
    setEnviando(true); setMsg(null)
    try {
      await pedirJson("/api/admin/backup/sharepoint", { method: "POST" })
      await cargar() // ya figura "en curso"
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo iniciar el respaldo." })
    } finally { setEnviando(false) }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b">
        <CloudUpload className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Respaldo automático a SharePoint</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Respaldo automático semanal que se sube a SharePoint y reemplaza la versión anterior.
      </p>
      {estado && !estado.configurado && (
        <p className="text-xs text-amber-700">Falta configurar BACKUP_CRON_SECRET en el servidor.</p>
      )}
      {estado?.enCurso && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          <span>
            <span className="font-medium">Respaldo en curso</span> desde las {new Date(estado.enCurso.desde).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            {estado.enCurso.por ? ` (${estado.enCurso.por})` : ""}. Tarda unos 2 a 5 minutos; puedes salir de esta pantalla.
          </span>
        </div>
      )}
      {estado?.ultimo ? (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estado.ultimo.ok
          ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {estado.ultimo.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>
            <span className="font-medium">{new Date(estado.ultimo.fecha).toLocaleString("es-CL")}</span> — {estado.ultimo.descripcion}
          </span>
        </div>
      ) : estado && <p className="text-xs text-muted-foreground">Aún no hay respaldos automáticos registrados.</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      <Button variant="outline" onClick={ahora} disabled={enviando || enCurso || estado?.configurado === false} className="gap-2">
        {enviando || enCurso ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
        {enCurso ? "Respaldo en curso…" : "Respaldar ahora en SharePoint"}
      </Button>
      <Button variant="ghost" size="sm" onClick={cargar}>Actualizar estado</Button>
    </div>
  )
}

type EstadoInv = { ultimo: { fecha: string; ok: boolean; descripcion: string | null; por: string | null } | null }

// Respaldo diario solo del inventario (Excel con stock, isotanques/contenedores en bodega y
// movimientos) en SharePoint; lo ejecuta una función programada de Netlify.
function RespaldoInventarioCard() {
  const [estado, setEstado] = useState<EstadoInv | null>(null)
  const [desde, setDesde] = useState<number | null>(null) // momento en que se lanzó a mano; null = nada en espera
  const [msg, setMsg] = useState<string | null>(null)

  const cargar = () => pedirJson<EstadoInv>("/api/admin/backup/inventario").then(setEstado).catch(() => {})
  useEffect(() => { cargar() }, [])

  // Tras lanzarlo a mano, se consulta cada 4 s hasta que aparezca un resultado posterior (máx. 2 min).
  const esperando = desde !== null
  useEffect(() => {
    if (desde === null) return
    const t = setInterval(() => {
      cargar()
      if (Date.now() - desde > 120_000) setDesde(null)
    }, 4000)
    return () => clearInterval(t)
  }, [desde])
  useEffect(() => {
    if (desde !== null && estado?.ultimo && new Date(estado.ultimo.fecha).getTime() > desde) setDesde(null)
  }, [estado, desde])

  async function ahora() {
    setMsg(null)
    try {
      await pedirJson("/api/admin/backup/inventario", { method: "POST" })
      setDesde(Date.now())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo iniciar el respaldo del inventario.")
      cargar()
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b">
        <CloudUpload className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Respaldo diario del inventario</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Excel del inventario (stock, isotanques y movimientos) que se sube cada día a SharePoint y reemplaza el anterior.
      </p>
      {esperando && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          <span><span className="font-medium">Respaldando inventario…</span> tarda unos segundos.</span>
        </div>
      )}
      {estado?.ultimo ? (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estado.ultimo.ok
          ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {estado.ultimo.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>
            <span className="font-medium">{new Date(estado.ultimo.fecha).toLocaleString("es-CL")}</span> — {estado.ultimo.descripcion}
          </span>
        </div>
      ) : estado && <p className="text-xs text-muted-foreground">Aún no hay respaldos del inventario registrados.</p>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <Button variant="outline" onClick={ahora} disabled={esperando} className="gap-2">
        {esperando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
        {esperando ? "Respaldando…" : "Respaldar inventario ahora"}
      </Button>
    </div>
  )
}
