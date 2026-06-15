import * as XLSX from "xlsx"
import type { Report } from "@/types/database"

const TIPO_MOV: Record<string, string> = { ingreso: "Ingreso", despacho: "Despacho" }
const TIPO_CONT: Record<string, string> = { "20ft": "20 ft", "40ft": "40 ft", isotanque: "Isotanque" }
const SOL_POR: Record<string, string> = { clientes: "Clientes", hds: "HDS", operaciones: "Operaciones", cuyd: "CUyD" }

const yn = (v: boolean | null | undefined) => (v ? "Sí" : "No")
const str = (v: string | number | null | undefined) => v ?? ""

export function exportReportsToExcel(reports: Report[], filename = "reports_adp") {
  const rows = reports.map(r => ({
    // ── Identificación ──────────────────────────────────────────
    "N° Report":            r.numero,
    "Estado":               { borrador: "Borrador", pendiente_despacho: "Pendiente despacho", despachado: "Despachado" }[r.estado] ?? r.estado,
    "Fecha":                str(r.fecha),
    "Fecha despacho":       r.fecha_despacho ? new Date(r.fecha_despacho).toLocaleString("es-CL") : "",

    // ── Antecedentes ────────────────────────────────────────────
    "Cliente":              str(r.cliente),
    "Patente":              str(r.patente),
    "Conductor":            str(r.conductor),
    "RUT conductor":        str(r.rut_conductor),
    "Empresa transporte":   str(r.empresa_transporte),
    "HDS (header)":         yn(r.hds_header),

    // ── Sección 1: Dep. Contenedores ────────────────────────────
    "Sec1 Activa":          yn(r.sec1_activa),
    "Sec1 Tipo movimiento": r.sec1_tipo_movimiento ? TIPO_MOV[r.sec1_tipo_movimiento] ?? r.sec1_tipo_movimiento : "",
    "Sec1 Tipo contenedor": r.sec1_tipo_contenedor ? TIPO_CONT[r.sec1_tipo_contenedor] ?? r.sec1_tipo_contenedor : "",
    "Sec1 Carga normal":    yn(r.sec1_carga_normal),
    "Sec1 Carga IMO":       yn(r.sec1_carga_imo),
    "Sec1 Clase IMO":       str(r.sec1_clase_imo),
    "Sec1 N°U":             str(r.sec1_nu),
    "Sec1 Hora inicio":     str(r.sec1_hora_inicio),
    "Sec1 Hora término":    str(r.sec1_hora_termino),
    "Sec1 Sigla":           str(r.sec1_sigla),
    "Sec1 N° Guía":         str(r.sec1_guia_numero),
    "Sec1 Interchange":     str(r.sec1_interchange),
    "Sec1 HDS":             yn(r.sec1_hds),

    // ── Sección 2: Consolidado / Otros ───────────────────────────
    "Sec2 Activa":          yn(r.sec2_activa),
    "Sec2 Consolidado":     yn(r.sec2_consolidado),
    "Sec2 Desconsolidado":  yn(r.sec2_desconsolidado),
    "Sec2 Picking":         yn(r.sec2_picking),
    "Sec2 Paletizado":      yn(r.sec2_paletizado),
    "Sec2 Etiquetado":      yn(r.sec2_etiquetado),
    "Sec2 Otro":            yn(r.sec2_otro),
    "Sec2 Hora inicio":     str(r.sec2_hora_inicio),
    "Sec2 Hora término":    str(r.sec2_hora_termino),
    "Sec2 Sigla / N°":      str(r.sec2_sigla_numero),
    "Sec2 Observaciones":   str(r.sec2_observaciones),

    // ── Sección 3: Bodegaje ──────────────────────────────────────
    "Sec3 Activa":          yn(r.sec3_activa),
    "Sec3 Producto":        str(r.sec3_producto),
    "Sec3 Clase IMO":       str(r.sec3_clase_imo),
    "Sec3 N°U":             str(r.sec3_nu),
    "Sec3 Hora inicio":     str(r.sec3_hora_inicio),
    "Sec3 Hora término":    str(r.sec3_hora_termino),
    "Sec3 N° Bodega":       str(r.sec3_numero_bodega),
    "Sec3 N° Guía":         str(r.sec3_numero_guia),
    "Sec3 Tipo movimiento": r.sec3_tipo ? TIPO_MOV[r.sec3_tipo] ?? r.sec3_tipo : "",
    "Sec3 N° Pallets":      r.sec3_numero_pallets ?? "",
    "Sec3 Solicitado por":  r.sec3_solicitado_por ? SOL_POR[r.sec3_solicitado_por] ?? r.sec3_solicitado_por : "",
    "Sec3 Detalle CUyD":    str(r.sec3_cuyd_detalle),
    "Sec3 Observaciones":   str(r.sec3_observaciones),

    // ── Firmas / Metadatos ───────────────────────────────────────
    "Nombre operador":      str(r.nombre_operador),
    "Nombre despachador":   str(r.nombre_despachador),
    "Creado":               r.created_at ? new Date(r.created_at).toLocaleString("es-CL") : "",
    "Actualizado":          r.updated_at ? new Date(r.updated_at).toLocaleString("es-CL") : "",
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Ancho automático de columnas
  const colWidths = Object.keys(rows[0] ?? {}).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String((r as Record<string,unknown>)[key] ?? "").length)) + 2,
  }))
  ws["!cols"] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Reports")

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${filename}_${date}.xlsx`)
}
