"use client"

import { useState, useEffect, useCallback } from "react"
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

const LS_KEY = "adp_notif_last_seen"

function getLastSeen(): Date {
  if (typeof window === "undefined") return new Date(0)
  const val = localStorage.getItem(LS_KEY)
  return val ? new Date(val) : new Date(0)
}

export function useNotifications() {
  const [items, setItems]   = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("reports")
      .select("id, numero, cliente, estado, sec1_tipo_movimiento, sec3_tipo, updated_at")
      .neq("estado", "borrador")
      .order("updated_at", { ascending: false })
      .limit(25)

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

    setItems(notifs)
    setUnread(notifs.filter(n => n.isNew).length)
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

  const markAllRead = useCallback(() => {
    localStorage.setItem(LS_KEY, new Date().toISOString())
    setUnread(0)
    setItems(prev => prev.map(n => ({ ...n, isNew: false })))
  }, [])

  return { items, unread, loading, markAllRead, refresh: fetchNotifications }
}
