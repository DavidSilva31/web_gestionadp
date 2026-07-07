export type TipoMovimiento = "ingreso" | "despacho"
export type TipoContenedor = "20ft" | "40ft" | "isotanque"
export type SolicitadoPor  = "clientes" | "hds" | "operaciones" | "cuyd"

export interface ReportFormData {
  cliente:            string
  fecha:              string
  patente:            string
  conductor:          string
  rut_conductor:      string
  empresa_transporte: string
  hds_header:         boolean

  sec1_activa:          boolean
  sec1_tipo_movimiento: TipoMovimiento | ""
  sec1_tipo_contenedor: TipoContenedor | ""
  sec1_carga_normal:    boolean
  sec1_carga_imo:       boolean
  sec1_clase_imo:       string
  sec1_nu:              string
  sec1_hora_inicio:     string
  sec1_hora_termino:    string
  sec1_sigla:           string
  sec1_guia_numero:     string
  sec1_interchange:     string
  sec1_hds:             boolean

  sec2_activa:         boolean
  sec2_consolidado:    boolean
  sec2_desconsolidado: boolean
  sec2_picking:        boolean
  sec2_paletizado:     boolean
  sec2_etiquetado:     boolean
  sec2_otro:           boolean
  sec2_hora_inicio:    string
  sec2_hora_termino:   string
  sec2_sigla_numero:   string
  sec2_observaciones:  string

  sec3_activa:         boolean
  sec3_producto:       string
  sec3_clase_imo:      string
  sec3_hora_inicio:    string
  sec3_hora_termino:   string
  sec3_numero_bodega:  string
  sec3_nu:             string
  sec3_tipo:           TipoMovimiento | ""
  sec3_numero_pallets: string
  sec3_numero_guia:    string
  sec3_solicitado_por: SolicitadoPor | ""
  sec3_cuyd_detalle:   string
  sec3_observaciones:  string

  nombre_operador: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToForm(data: Record<string, any>): ReportFormData {
  const s = (v: unknown) => (v ?? "") as string
  const b = (v: unknown) => Boolean(v)
  return {
    cliente: s(data.cliente), fecha: s(data.fecha), patente: s(data.patente),
    conductor: s(data.conductor), rut_conductor: s(data.rut_conductor),
    empresa_transporte: s(data.empresa_transporte), hds_header: b(data.hds_header),
    sec1_activa: b(data.sec1_activa),
    sec1_tipo_movimiento: s(data.sec1_tipo_movimiento) as TipoMovimiento | "",
    sec1_tipo_contenedor: s(data.sec1_tipo_contenedor) as TipoContenedor | "",
    sec1_carga_normal: b(data.sec1_carga_normal), sec1_carga_imo: b(data.sec1_carga_imo),
    sec1_clase_imo: s(data.sec1_clase_imo), sec1_nu: s(data.sec1_nu),
    sec1_hora_inicio: s(data.sec1_hora_inicio), sec1_hora_termino: s(data.sec1_hora_termino),
    sec1_sigla: s(data.sec1_sigla), sec1_guia_numero: s(data.sec1_guia_numero),
    sec1_interchange: s(data.sec1_interchange), sec1_hds: b(data.sec1_hds),
    sec2_activa: b(data.sec2_activa), sec2_consolidado: b(data.sec2_consolidado),
    sec2_desconsolidado: b(data.sec2_desconsolidado), sec2_picking: b(data.sec2_picking),
    sec2_paletizado: b(data.sec2_paletizado), sec2_etiquetado: b(data.sec2_etiquetado),
    sec2_otro: b(data.sec2_otro),
    sec2_hora_inicio: s(data.sec2_hora_inicio), sec2_hora_termino: s(data.sec2_hora_termino),
    sec2_sigla_numero: s(data.sec2_sigla_numero), sec2_observaciones: s(data.sec2_observaciones),
    sec3_activa: b(data.sec3_activa), sec3_producto: s(data.sec3_producto),
    sec3_clase_imo: s(data.sec3_clase_imo),
    sec3_hora_inicio: s(data.sec3_hora_inicio), sec3_hora_termino: s(data.sec3_hora_termino),
    sec3_numero_bodega: s(data.sec3_numero_bodega), sec3_nu: s(data.sec3_nu),
    sec3_tipo: s(data.sec3_tipo) as TipoMovimiento | "",
    sec3_numero_pallets: data.sec3_numero_pallets != null ? String(data.sec3_numero_pallets) : "",
    sec3_numero_guia: s(data.sec3_numero_guia),
    sec3_solicitado_por: s(data.sec3_solicitado_por) as SolicitadoPor | "",
    sec3_cuyd_detalle: s(data.sec3_cuyd_detalle), sec3_observaciones: s(data.sec3_observaciones),
    nombre_operador: s(data.nombre_operador),
  }
}
