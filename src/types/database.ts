export type ReportEstado = 'borrador' | 'pendiente_despacho' | 'despachado'
export type InventarioCategoria = 'Contenedor IMO' | 'Isotanque' | 'Residuo peligroso' | 'Carga general'
export type InventarioArea = 'Bodega IMO' | 'Zona Isotanques' | 'Zona RESPEL' | 'Bodega General'
export type MovimientoTipo = 'ingreso' | 'despacho'
export type MovimientoServicio = 'Almacenaje' | 'Transporte' | 'Porteo' | 'Logística'
export type MovimientoEstado = 'en_proceso' | 'completado'
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
  sec3_inventario_item_id: string | null
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

export interface Cliente {
  id:         string
  numero:     number
  nombre:     string
  rut:        string
  contacto:   string | null
  email:      string | null
  sector:     string | null
  activo:     boolean
  created_at: string
  updated_at: string
}

export type ClienteInsert = Omit<Cliente, 'id' | 'numero' | 'created_at' | 'updated_at'>

export interface InventarioItem {
  id:            string
  numero:        number
  cliente_id:    string
  descripcion:   string
  categoria:     InventarioCategoria
  area:          InventarioArea
  clase_imo:     string | null
  nu:            string | null
  unidad:        string
  stock_actual:  number
  stock_minimo:  number
  observaciones: string | null
  activo:        boolean
  created_at:    string
  updated_at:    string
  created_by:    string | null
}

export type InventarioItemInsert = Omit<InventarioItem, 'id' | 'numero' | 'created_at' | 'updated_at'>

export interface Movimiento {
  id:                 string
  numero:             number
  tipo:               MovimientoTipo
  servicio:           MovimientoServicio
  cliente_id:         string | null
  cliente_nombre:     string | null
  carga:              string
  area:               InventarioArea | null
  inventario_item_id: string | null
  unidades:           number | null
  operador:           string | null
  estado:             MovimientoEstado
  observaciones:      string | null
  fecha:              string
  report_id:          string | null
  created_at:         string
  updated_at:         string
  created_by:         string | null
}

export type MovimientoInsert = Omit<Movimiento, 'id' | 'numero' | 'created_at' | 'updated_at'>

export interface TarifaCliente {
  id:                      string
  cliente_id:              string
  cotizacion_numero:       string
  clase_imo:               string | null
  tarifa_almacenaje_uf:    number | null
  tarifa_inout_uf:         number | null
  tarifa_descons_20_uf:    number | null
  tarifa_descons_40_uf:    number | null
  tarifa_consolid_40_uf:   number | null
  tarifa_porteo_uf:        number | null
  tarifa_palletizado_uf:   number | null
  facturacion_minima_uf:   number | null
  activo:                  boolean
  created_at:              string
}

export type TarifaClienteInsert = Omit<TarifaCliente, 'id' | 'created_at'>

export interface ServicioCliente {
  id:          string
  cliente_id:  string
  nombre:      string
  descripcion: string | null
  tarifa_uf:   number | null
  unidad:      string
  orden:       number
  activo:      boolean
  created_at:  string
}

export type ServicioClienteInsert = Omit<ServicioCliente, 'id' | 'created_at'>
