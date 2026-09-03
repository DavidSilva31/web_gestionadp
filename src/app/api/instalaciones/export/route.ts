import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import path from "path"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import type { InstalacionAlmacenamiento } from "@/types/database"

// ─── Paleta — misma línea visual que los HES (azul navy ADP) ──────────────────
const C = {
  HDR_BG:   "FFDCE6F1",
  HDR_TXT:  "FF1F3864",
  TOT_BG:   "FFBDD7EE",
  WHITE:    "FFFFFFFF",
  TEXT:     "FF000000",
  GREY_BD:  "FFAAAAAA",
  BLUE_TXT: "FF1F3864",
  GREEN_BG: "FFE2F0D9",
  GREEN_TXT:"FF548235",
  AMBER_BG: "FFFFF2CC",
  AMBER_TXT:"FF7B3C00",
  RED_BG:   "FFFCE4E4",
  RED_TXT:  "FFC00000",
}

interface StyleOpts {
  bg?: string; fc?: string; bold?: boolean; size?: number; italic?: boolean
  ha?: ExcelJS.Alignment["horizontal"]; va?: ExcelJS.Alignment["vertical"]
  fmt?: string; wrap?: boolean; noBorder?: boolean
}
function st(cell: ExcelJS.Cell, o: StyleOpts = {}) {
  const { bg = C.WHITE, fc = C.TEXT, bold = false, size = 9, italic = false, ha = "left", va = "middle", fmt, wrap = false, noBorder = false } = o
  const brd = noBorder ? {} : {
    border: {
      top: { style: "thin" as const, color: { argb: C.GREY_BD } },
      bottom: { style: "thin" as const, color: { argb: C.GREY_BD } },
      left: { style: "thin" as const, color: { argb: C.GREY_BD } },
      right: { style: "thin" as const, color: { argb: C.GREY_BD } },
    },
  }
  cell.style = {
    font: { bold, italic, size, color: { argb: fc }, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
    alignment: { horizontal: ha, vertical: va, wrapText: wrap },
    ...brd,
  }
  if (fmt) cell.numFmt = fmt
}

function fmtFecha(iso: string | null) {
  if (!iso) return null
  return iso.split("-").reverse().join("/")
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    // proxy.ts excluye /api/* del chequeo de activo — cada ruta lo hace sola.
    const { data: callerProfile, error: profileErr } = await supabase.from("profiles").select("activo").eq("id", user.id).single()
    if (profileErr) {
      console.error("[instalaciones/export] error obteniendo perfil:", profileErr)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!callerProfile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })

    const [{ data: instalaciones, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      supabase.from("instalaciones_almacenamiento").select("*").eq("activo", true).order("orden").order("codigo"),
      supabase.from("inventario_items")
        .select("instalacion_id, descripcion, clase_imo, unidad, stock_actual, peso_ton, clientes(nombre)")
        .eq("activo", true).not("instalacion_id", "is", null),
    ])
    if (e1 ?? e2) {
      console.error("[instalaciones/export] error consultando datos:", e1 ?? e2)
      return NextResponse.json({ error: "No se pudieron obtener los datos de instalaciones." }, { status: 500 })
    }

    const itemsPorInstalacion: Record<string, { descripcion: string; clase_imo: string | null; unidad: string; stock_actual: number; peso_ton: number | null; cliente: string | null }[]> = {}
    for (const it of (items ?? []) as unknown as { instalacion_id: string; descripcion: string; clase_imo: string | null; unidad: string; stock_actual: number; peso_ton: number | null; clientes: { nombre: string } | null }[]) {
      itemsPorInstalacion[it.instalacion_id] ??= []
      itemsPorInstalacion[it.instalacion_id].push({
        descripcion: it.descripcion, clase_imo: it.clase_imo, unidad: it.unidad,
        stock_actual: it.stock_actual, peso_ton: it.peso_ton, cliente: it.clientes?.nombre ?? null,
      })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = "ADP Gestión"
    wb.created = new Date()

    for (const inst of (instalaciones ?? []) as InstalacionAlmacenamiento[]) {
      addInstalacionSheet(wb, inst, itemsPorInstalacion[inst.id] ?? [])
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Instalaciones_ADP_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (err) {
    console.error("[instalaciones/export] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo generar el archivo Excel." }, { status: 500 })
  }
}

function addInstalacionSheet(
  wb: ExcelJS.Workbook, inst: InstalacionAlmacenamiento,
  rows: { descripcion: string; clase_imo: string | null; unidad: string; stock_actual: number; peso_ton: number | null; cliente: string | null }[]
) {
  const baseName = inst.codigo.replace(/[\\/?*[\]:]/g, "").slice(0, 28)
  let sheetName = baseName || "Instalación"
  let n = 2
  while (wb.getWorksheet(sheetName)) { sheetName = `${baseName} (${n})`.slice(0, 31); n++ }

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  })
  ws.columns = [
    { width: 2 }, { width: 34 }, { width: 12 }, { width: 26 }, { width: 14 }, { width: 12 },
  ]
  function spacerA(r: ExcelJS.Row) { st(r.getCell("A"), { noBorder: true }) }

  try {
    const logoPath = path.join(process.cwd(), "public", "adp_logo_hd.jpg")
    const logoId = wb.addImage({ filename: logoPath, extension: "jpeg" })
    ws.addImage(logoId, { tl: { col: 3.6, row: 0.3 }, ext: { width: 130, height: 46 } })
  } catch { /* sin logo — continúa */ }

  let row = 1
  { const r = ws.addRow([]); r.height = 22; spacerA(r)
    r.getCell("B").value = `INSTALACIÓN ${inst.codigo.toUpperCase()}`
    st(r.getCell("B"), { bold: true, size: 14, fc: C.BLUE_TXT, noBorder: true }); row++ }
  { const r = ws.addRow([]); r.height = 16; spacerA(r)
    r.getCell("B").value = `${inst.tipo} · ${inst.capacidad}`
    st(r.getCell("B"), { size: 9.5, noBorder: true }); row++ }
  if (inst.resolucion_sanitaria_numero) {
    const r = ws.addRow([]); r.height = 14; spacerA(r)
    r.getCell("B").value = `Res. sanitaria N° ${inst.resolucion_sanitaria_numero}${inst.resolucion_sanitaria_fecha ? ` del ${fmtFecha(inst.resolucion_sanitaria_fecha)}` : ""}`
    st(r.getCell("B"), { size: 8.5, fc: "FF64748B", noBorder: true }); row++
  }
  { const r = ws.addRow([]); r.height = 8; spacerA(r); row++ }

  const totalTon = rows.reduce((s, r) => s + (r.peso_ton ?? 0), 0)
  if (inst.capacidad_ton) {
    const pct = Math.min(100, Math.round((totalTon / inst.capacidad_ton) * 100))
    const [bg, txt] = pct >= 90 ? [C.RED_BG, C.RED_TXT] : pct >= 70 ? [C.AMBER_BG, C.AMBER_TXT] : [C.GREEN_BG, C.GREEN_TXT]
    const r = ws.addRow([]); r.height = 18; spacerA(r)
    r.getCell("B").value = "OCUPACIÓN"
    st(r.getCell("B"), { bg, fc: txt, bold: true, size: 9 })
    r.getCell("C").value = `${totalTon.toFixed(2)} / ${inst.capacidad_ton} ton`
    st(r.getCell("C"), { bg, fc: txt, bold: true, size: 9, ha: "right" })
    r.getCell("D").value = `${pct}%`
    st(r.getCell("D"), { bg, fc: txt, bold: true, size: 9, ha: "center" })
    ws.mergeCells(`B${row}:B${row}`)
    row++
    { const r2 = ws.addRow([]); r2.height = 6; spacerA(r2); row++ }
  }

  { const r = ws.addRow([]); r.height = 24; spacerA(r)
    const hdrs: [string, string, ExcelJS.Alignment["horizontal"]][] = [
      ["B", "Producto", "left"], ["C", "Clase IMO", "center"], ["D", "Cliente", "left"],
      ["E", "Cantidad", "right"], ["F", "Unidad", "center"],
    ]
    hdrs.forEach(([col, val, ha]) => {
      r.getCell(col).value = val
      st(r.getCell(col), { bg: C.HDR_BG, fc: C.HDR_TXT, bold: true, size: 9, ha, wrap: true })
    })
    row++
  }

  rows.forEach((it, i) => {
    const r = ws.addRow([]); r.height = 14; spacerA(r)
    const alt = i % 2 !== 0 ? "FFF8FAFC" : C.WHITE
    r.getCell("B").value = it.descripcion
    st(r.getCell("B"), { bg: alt, size: 9, wrap: true })
    r.getCell("C").value = it.clase_imo ?? "—"
    st(r.getCell("C"), { bg: alt, size: 9, ha: "center" })
    r.getCell("D").value = it.cliente ?? "—"
    st(r.getCell("D"), { bg: alt, size: 9 })
    r.getCell("E").value = it.stock_actual
    st(r.getCell("E"), { bg: alt, size: 9, ha: "right", fmt: "#,##0" })
    r.getCell("F").value = it.unidad
    st(r.getCell("F"), { bg: alt, size: 9, ha: "center" })
    row++
  })

  if (rows.length === 0) {
    const r = ws.addRow([]); r.height = 16; spacerA(r)
    r.getCell("B").value = "Sin ítems asignados"
    st(r.getCell("B"), { size: 9, italic: true, fc: "FF64748B" })
    ws.mergeCells(`B${row}:F${row}`)
    row++
  } else {
    const r = ws.addRow([]); r.height = 16; spacerA(r)
    r.getCell("B").value = `TOTAL (${rows.length} ítem${rows.length > 1 ? "s" : ""})`
    st(r.getCell("B"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 9, ha: "right" })
    ws.mergeCells(`B${row}:D${row}`)
    r.getCell("E").value = rows.reduce((s, it) => s + it.stock_actual, 0)
    st(r.getCell("E"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 9, ha: "right", fmt: "#,##0" })
    r.getCell("F").value = ""
    st(r.getCell("F"), { bg: C.TOT_BG })
  }
}
