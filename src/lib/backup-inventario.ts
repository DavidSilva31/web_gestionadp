// Respaldo diario del inventario: un Excel con el stock actual, los isotanques/contenedores en
// bodega y el historial de movimientos. Sin dependencias de Next (lo usa una función de Netlify,
// por eso los imports son relativos).
import ExcelJS from "exceljs"
import { supabaseAdmin } from "./supabase-admin"
import { sanitizeSpreadsheetCell } from "./sanitize"

async function traerTodo<T>(tabla: string, columnas: string, orden: string): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabaseAdmin.from(tabla).select(columnas).order(orden, { ascending: true }).range(desde, desde + 999)
    if (error) throw new Error(`Tabla ${tabla}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}

type Item = {
  id: string; numero: number; cliente_id: string | null; descripcion: string; categoria: string | null
  area: string | null; clase_imo: string | null; nu: string | null; unidad: string | null
  stock_actual: number | null; stock_unidades: number | null; peso_ton: number | null
  stock_minimo: number | null; activo: boolean; observaciones: string | null
}
type Mov = {
  numero: number; fecha: string; tipo: string; cliente_nombre: string | null; carga: string | null; area: string | null
  inventario_item_id: string | null; codigo: string | null; unidades: number | null; posiciones: number | null
  lote: string | null; fecha_elaboracion: string | null; fecha_vencimiento: string | null
  imo: string | null; un: string | null; cas: string | null; tipo_envase: string | null; peso_envase: number | null
  orden_compra: string | null; guia_numero: string | null; operador: string | null; report_id: string | null
  servicio: string | null; oculto: boolean | null
}

const txt = (v: string | null | undefined) => (typeof v === "string" ? sanitizeSpreadsheetCell(v) : v ?? "")
const yn = (v: boolean | null | undefined) => (v ? "Sí" : "No")
const fechaCL = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "")

function hoja(wb: ExcelJS.Workbook, nombre: string, filas: Record<string, string | number>[]) {
  const ws = wb.addWorksheet(nombre)
  const keys = Object.keys(filas[0] ?? { "(sin datos)": "" })
  ws.columns = keys.map(key => ({
    header: key, key,
    width: Math.min(60, Math.max(key.length, ...filas.map(r => String(r[key] ?? "").length)) + 2),
  }))
  ws.addRows(filas)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  return ws
}

export type ResumenInventario = { items: number; enBodega: number; movimientos: number; bytes: number }

export async function generarInventarioXlsx(): Promise<{ buffer: Buffer; resumen: ResumenInventario }> {
  const [clientes, items, movs, reports] = await Promise.all([
    traerTodo<{ id: string; nombre: string }>("clientes", "id, nombre", "nombre"),
    traerTodo<Item>("inventario_items", "id, numero, cliente_id, descripcion, categoria, area, clase_imo, nu, unidad, stock_actual, stock_unidades, peso_ton, stock_minimo, activo, observaciones", "numero"),
    traerTodo<Mov>("movimientos", "numero, fecha, tipo, cliente_nombre, carga, area, inventario_item_id, codigo, unidades, posiciones, lote, fecha_elaboracion, fecha_vencimiento, imo, un, cas, tipo_envase, peso_envase, orden_compra, guia_numero, operador, report_id, servicio, oculto", "numero"),
    traerTodo<{ id: string; numero: number }>("reports", "id, numero", "numero"),
  ])
  const nombreCliente = new Map(clientes.map(c => [c.id, c.nombre]))
  const itemPorId = new Map(items.map(i => [i.id, i]))
  const numReport = new Map(reports.map(r => [r.id, r.numero]))

  const stock = [...items]
    .sort((a, b) => (nombreCliente.get(a.cliente_id ?? "") ?? "").localeCompare(nombreCliente.get(b.cliente_id ?? "") ?? "") || a.descripcion.localeCompare(b.descripcion))
    .map(i => ({
      "Cliente": txt(nombreCliente.get(i.cliente_id ?? "") ?? ""),
      "Producto": txt(i.descripcion),
      "Categoría": txt(i.categoria),
      "Área": txt(i.area),
      "Clase IMO": txt(i.clase_imo),
      "NU": txt(i.nu),
      "Unidad": txt(i.unidad),
      "Posiciones": i.stock_actual ?? 0,
      "Unidades": i.stock_unidades ?? 0,
      "Peso (ton)": i.peso_ton ?? "",
      "Stock mínimo": i.stock_minimo ?? "",
      "Activo": yn(i.activo),
      "Observaciones": txt(i.observaciones),
    }))

  // Isotanques / contenedores en bodega: códigos cuyo neto (ingresos − despachos) es positivo.
  const neto = new Map<string, number>()
  for (const m of movs) {
    const it = m.inventario_item_id ? itemPorId.get(m.inventario_item_id) : undefined
    // Solo los productos-unidad ISOTANQUE / CONTENEDORES (otros ítems con categoría de contenedor
    // llevan SKUs de producto en "codigo", no el código de un contenedor).
    if (!it || !m.codigo || !/^(isotanque|contenedores?)$/i.test(it.descripcion.trim())) continue
    const k = `${it.id}|${m.codigo}`
    neto.set(k, (neto.get(k) ?? 0) + (m.tipo === "ingreso" ? 1 : -1))
  }
  const enBodega = [...neto.entries()].filter(([, n]) => n > 0).map(([k]) => {
    const [itemId, codigo] = k.split("|")
    const it = itemPorId.get(itemId)!
    return { "Cliente": txt(nombreCliente.get(it.cliente_id ?? "") ?? ""), "Tipo": txt(it.categoria), "Código": txt(codigo) }
  }).sort((a, b) => a.Cliente.localeCompare(b.Cliente) || a["Código"].localeCompare(b["Código"]))

  const movimientos = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(m => ({
    "N°": m.numero,
    "Fecha": fechaCL(m.fecha),
    "Tipo": m.tipo === "ingreso" ? "Ingreso" : "Despacho",
    "Cliente": txt(m.cliente_nombre),
    "Producto": txt(m.carga),
    "Código / SKU": txt(m.codigo),
    "Área": txt(m.area),
    "Posiciones": m.posiciones ?? "",
    "Unidades": m.unidades ?? "",
    "Lote": txt(m.lote),
    "Elaboración": txt(m.fecha_elaboracion),
    "Vencimiento": txt(m.fecha_vencimiento),
    "IMO": txt(m.imo),
    "NU": txt(m.un),
    "CAS": txt(m.cas),
    "Envase": txt(m.tipo_envase),
    "Peso envase": m.peso_envase ?? "",
    "OC": txt(m.orden_compra),
    "N° Guía": txt(m.guia_numero),
    "Operador": txt(m.operador),
    "Report": m.report_id ? numReport.get(m.report_id) ?? "" : "",
    "Servicio": txt(m.servicio),
    "Oculto": yn(m.oculto),
  }))

  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()
  hoja(wb, "Stock actual", stock)
  hoja(wb, "Isotanques y contenedores", enBodega)
  hoja(wb, "Movimientos", movimientos)
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  return { buffer, resumen: { items: stock.length, enBodega: enBodega.length, movimientos: movimientos.length, bytes: buffer.byteLength } }
}
