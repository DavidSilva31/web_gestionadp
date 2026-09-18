// Herramientas de solo lectura que el chatbot puede invocar (function calling
// de Gemini) para responder con datos reales del sistema. Todas las consultas
// corren con el cliente Supabase del usuario que hace la pregunta — respetan
// las mismas políticas RLS que el resto de la app, así que el bot nunca ve
// más de lo que el usuario ya podría ver navegando la app.
import { Type, type FunctionDeclaration } from "@google/genai"
import type { SupabaseClient } from "@supabase/supabase-js"

export const CHATBOT_TOOLS: FunctionDeclaration[] = [
  {
    name: "resumen_inventario",
    description: "Trae el total agregado de stock en TODO el inventario activo (suma de posiciones y de unidades, cantidad de ítems y de clientes con carga). Úsala para preguntas generales como \"cuántas unidades/posiciones tenemos en bodega\" — buscar_inventario solo trae hasta 15 ítems puntuales, no sirve para totales.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "buscar_inventario",
    description: "Busca ítems de inventario por nombre de cliente y/o texto en la descripción/clase IMO. Devuelve stock actual (posiciones), stock en unidades, stock mínimo y estado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cliente: { type: Type.STRING, description: "Nombre (parcial, sin distinguir mayúsculas) del cliente dueño del inventario." },
        query:   { type: Type.STRING, description: "Texto a buscar en la descripción del producto o en la clase IMO." },
      },
    },
  },
  {
    name: "buscar_reports",
    description: "Busca reports (documentos de paso de camión) por cliente, patente, estado y/o rango de fechas. Devuelve los más recientes primero.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cliente: { type: Type.STRING, description: "Nombre parcial del cliente." },
        patente: { type: Type.STRING, description: "Patente del camión, parcial o completa." },
        estado:  { type: Type.STRING, description: "Estado exacto del report.", enum: ["borrador", "pendiente_operaciones", "pendiente_despacho", "despachado"] },
        fecha_desde: { type: Type.STRING, description: "Fecha mínima en formato YYYY-MM-DD." },
        fecha_hasta: { type: Type.STRING, description: "Fecha máxima en formato YYYY-MM-DD." },
      },
    },
  },
  {
    name: "buscar_clientes",
    description: "Busca clientes registrados por nombre o RUT. Devuelve datos de contacto y si están activos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Texto a buscar en nombre o RUT del cliente." },
      },
    },
  },
  {
    name: "buscar_viajes_transporte_adp",
    description: "Busca viajes del módulo Transporte ADP (antes Transporte Incomex) por cliente y/o período. Incluye si ya tienen tarifa asignada.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cliente:     { type: Type.STRING, description: "Nombre parcial de la empresa/cliente del viaje." },
        fecha_desde: { type: Type.STRING, description: "Fecha mínima en formato YYYY-MM-DD." },
        fecha_hasta: { type: Type.STRING, description: "Fecha máxima en formato YYYY-MM-DD." },
        solo_pendientes: { type: Type.BOOLEAN, description: "Si es true, trae solo los viajes sin tarifa (factura_cliente_uf) asignada." },
      },
    },
  },
]

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Ingresado", pendiente_operaciones: "Pendiente operaciones",
  pendiente_despacho: "Pendiente despacho", despachado: "Despachado",
}

function estadoStock(item: { stock_actual: number; stock_minimo: number }): string {
  if (item.stock_actual <= 0) return "Crítico"
  if (item.stock_actual <= item.stock_minimo) return "Bajo"
  return "Normal"
}

const MAX_ROWS = 15

export async function runChatbotTool(
  supabase: SupabaseClient, name: string, args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "resumen_inventario": {
      const { data, error } = await supabase.from("inventario_items")
        .select("stock_actual, stock_unidades, cliente_id")
        .eq("activo", true)
      if (error) return { error: error.message }
      const rows = (data ?? []) as Array<{ stock_actual: number; stock_unidades: number; cliente_id: string }>
      return {
        total_items: rows.length,
        total_posiciones: rows.reduce((s, r) => s + (r.stock_actual ?? 0), 0),
        total_unidades: rows.reduce((s, r) => s + (r.stock_unidades ?? 0), 0),
        clientes_con_carga: new Set(rows.map(r => r.cliente_id)).size,
      }
    }

    case "buscar_inventario": {
      let q = supabase.from("inventario_items")
        .select("descripcion, clase_imo, unidad, stock_actual, stock_unidades, stock_minimo, activo, clientes(nombre)")
        .eq("activo", true)
        .limit(MAX_ROWS)
      const cliente = args.cliente as string | undefined
      const query   = args.query as string | undefined
      if (query) q = q.or(`descripcion.ilike.%${query}%,clase_imo.ilike.%${query}%`)
      const { data, error } = await q
      if (error) return { error: error.message }
      let rows = (data ?? []) as unknown as Array<{
        descripcion: string; clase_imo: string | null; unidad: string
        stock_actual: number; stock_unidades: number; stock_minimo: number
        clientes: { nombre: string } | null
      }>
      if (cliente) {
        const c = cliente.toLowerCase()
        rows = rows.filter(r => r.clientes?.nombre?.toLowerCase().includes(c))
      }
      return rows.map(r => ({
        cliente: r.clientes?.nombre ?? null,
        producto: r.descripcion,
        clase_imo: r.clase_imo,
        stock_posiciones: r.stock_actual,
        stock_unidades: r.stock_unidades,
        stock_minimo: r.stock_minimo,
        estado: estadoStock(r),
      }))
    }

    case "buscar_reports": {
      let q = supabase.from("reports")
        .select("numero, cliente, patente, conductor, fecha, estado")
        .order("numero", { ascending: false })
        .limit(MAX_ROWS)
      const cliente = args.cliente as string | undefined
      const patente = args.patente as string | undefined
      const estado  = args.estado as string | undefined
      const desde   = args.fecha_desde as string | undefined
      const hasta   = args.fecha_hasta as string | undefined
      if (cliente) q = q.ilike("cliente", `%${cliente}%`)
      if (patente) q = q.ilike("patente", `%${patente}%`)
      if (estado)  q = q.eq("estado", estado)
      if (desde)   q = q.gte("fecha", desde)
      if (hasta)   q = q.lte("fecha", hasta)
      const { data, error } = await q
      if (error) return { error: error.message }
      return (data ?? []).map(r => ({ ...r, estado_label: ESTADO_LABEL[r.estado] ?? r.estado }))
    }

    case "buscar_clientes": {
      const query = (args.query as string | undefined) ?? ""
      let q = supabase.from("clientes")
        .select("nombre, rut, sector, activo, contacto_comercial_nombre")
        .limit(MAX_ROWS)
      if (query) q = q.or(`nombre.ilike.%${query}%,rut.ilike.%${query}%`)
      const { data, error } = await q
      if (error) return { error: error.message }
      return data ?? []
    }

    case "buscar_viajes_transporte_adp": {
      let q = supabase.from("transporte_incomex")
        .select("fecha, empresa_texto, tipo_movimiento, origen_destino, guia_numero, factura_cliente_uf")
        .eq("activo", true)
        .order("fecha", { ascending: false })
        .limit(MAX_ROWS)
      const cliente = args.cliente as string | undefined
      const desde   = args.fecha_desde as string | undefined
      const hasta   = args.fecha_hasta as string | undefined
      const soloPendientes = args.solo_pendientes as boolean | undefined
      if (cliente) q = q.ilike("empresa_texto", `%${cliente}%`)
      if (desde)   q = q.gte("fecha", desde)
      if (hasta)   q = q.lte("fecha", hasta)
      if (soloPendientes) q = q.is("factura_cliente_uf", null)
      const { data, error } = await q
      if (error) return { error: error.message }
      return (data ?? []).map(r => ({
        fecha: r.fecha, empresa: r.empresa_texto, tipo_movimiento: r.tipo_movimiento,
        origen_destino: r.origen_destino, guia: r.guia_numero,
        factura_uf: r.factura_cliente_uf, tiene_tarifa: r.factura_cliente_uf != null,
      }))
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}
