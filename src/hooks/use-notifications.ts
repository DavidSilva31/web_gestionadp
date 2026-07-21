"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"

export interface NotificationItem {
  id: string
  numero: number
  cliente: string
  estado: string
  tipo: string | null
  updated_at: string
  isNew: boolean
}

const LS_KEY_SEEN      = "adp_notif_last_seen"
const LS_KEY_DISMISSED = "adp_notif_dismissed"

function getLastSeen(): Date {
  if (typeof window === "undefined") return new Date(0)
  const val = localStorage.getItem(LS_KEY_SEEN)
  return val ? new Date(val) : new Date(0)
}

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(LS_KEY_DISMISSED)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(LS_KEY_DISMISSED, JSON.stringify([...ids]))
}

export function useNotifications() {
  // rawItems = todo lo que devuelve la consulta; items (derivado) descuenta los descartados
  const [rawItems, setRawItems]         = useState<NotificationItem[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissed())
  const [loading, setLoading]           = useState(true)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("reports")
      .select("id, numero, cliente, estado, sec1_tipo_movimiento, sec3_tipo, updated_at")
      .neq("estado", "borrador")
      .order("updated_at", { ascending: false })
      .limit(25)

    if (error) console.error("[notifications] error obteniendo notificaciones:", error)
    if (!data) { setLoading(false); return }

    const lastSeen = getLastSeen()
    const notifs: NotificationItem[] = data.map(r => ({
      id:         r.id,
      numero:     r.numero,
      cliente:    r.cliente,
      estado:     r.estado,
      tipo:       r.sec1_tipo_movimiento ?? r.sec3_tipo ?? null,
      updated_at: r.updated_at,
      isNew:      new Date(r.updated_at) > lastSeen,
    }))

    setRawItems(notifs)
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Realtime: cualquier cambio en reports recarga las notificaciones
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("reports-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        fetchNotifications()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchNotifications])

  const items  = useMemo(() => rawItems.filter(n => !dismissedIds.has(n.id)), [rawItems, dismissedIds])
  const unread = useMemo(() => items.filter(n => n.isNew).length, [items])

  const markAllRead = useCallback(() => {
    localStorage.setItem(LS_KEY_SEEN, new Date().toISOString())
    setRawItems(prev => prev.map(n => ({ ...n, isNew: false })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      for (const n of rawItems) next.add(n.id)
      saveDismissed(next)
      return next
    })
  }, [rawItems])

  return { items, unread, loading, markAllRead, dismiss, clearAll, refresh: fetchNotifications }
}
