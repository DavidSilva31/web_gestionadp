export type ReportEstado = 'borrador' | 'pendiente_despacho' | 'despachado'
export type TipoMovimiento = 'ingreso' | 'despacho'
export type TipoContenedor = '20ft' | '40ft' | 'isotanque'
export type SolicitadoPor = 'clientes' | 'hds' | 'operaciones' | 'cuyd'

export interface Report {
  id: string
  numero: number
  estado: ReportEstado

  // Antecedentes
  cliente: string
  fecha: string
  patente: string
  conductor: string
  rut_conductor: string | null
  empresa_transporte: string | null
  hds_header: boolean

  // Sección 1
  sec1_activa: boolean
  sec1_tipo_movimiento: TipoMovimiento | null
  sec1_tipo_contenedor: TipoContenedor | null
  sec1_carga_normal: boolean
  sec1_carga_imo: boolean
  sec1_clase_imo: string | null
  sec1_nu: string | null
  sec1_hora_inicio: string | null
  sec1_hora_termino: string | null
  sec1_sigla: string | null
  sec1_guia_numero: string | null
  sec1_interchange: string | null
  sec1_hds: boolean

  // Sección 2
  sec2_activa: boolean
  sec2_consolidado: boolean
  sec2_desconsolidado: boolean
  sec2_picking: boolean
  sec2_paletizado: boolean
  sec2_etiquetado: boolean
  sec2_otro: boolean
  sec2_hora_inicio: string | null
  sec2_hora_termino: string | null
  sec2_sigla_numero: string | null
  sec2_observaciones: string | null

  // Sección 3
  sec3_activa: boolean
  sec3_producto: string | null
  sec3_clase_imo: string | null
  sec3_hora_inicio: string | null
  sec3_hora_termino: string | null
  sec3_numero_bodega: string | null
  sec3_nu: string | null
  sec3_tipo: TipoMovimiento | null
  sec3_numero_pallets: number | null
  sec3_numero_guia: string | null
  sec3_solicitado_por: SolicitadoPor | null
  sec3_cuyd_detalle: string | null
  sec3_observaciones: string | null

  // Firmas
  nombre_operador: string | null
  created_at: string
  created_by: string | null

  nombre_despachador: string | null
  fecha_despacho: string | null
  dispatched_by: string | null
  updated_at: string
}

export type ReportInsert = Omit<Report, 'id' | 'numero' | 'created_at' | 'updated_at'>
