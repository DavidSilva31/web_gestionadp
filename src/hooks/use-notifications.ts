"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { NOTIFY_ACCIONES, type AuditAccion } from "@/lib/audit"

export interface NotificationItem {
  id:             string
  tabla:          string
  registro_id:    string
  accion:         AuditAccion
  descripcion:    string | null
  usuario_nombre: string | null
  created_at:     string
  isNew:          boolean
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
  const { profile } = useAuth()
  // Mientras el perfil no cargó, se asume habilitado (default en BD es true) para
  // no parpadear la campanita; una vez cargado, se respeta la preferencia explícita.
  const enabled = profile ? profile.notificaciones_activas !== false : true

  // rawItems = todo lo que devuelve la consulta; items (derivado) descuenta los descartados
  const [rawItems, setRawItems]         = useState<NotificationItem[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissed())
  const [loading, setLoading]           = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!enabled) { setRawItems([]); setLoading(false); return }
    const supabase = createClient()
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, tabla, registro_id, accion, descripcion, usuario_nombre, created_at")
      .in("accion", NOTIFY_ACCIONES)
      .order("created_at", { ascending: false })
      .limit(25)

    if (error) console.error("[notifications] error obteniendo notificaciones:", error)
    if (!data) { setLoading(false); return }

    const lastSeen = getLastSeen()
    const notifs: NotificationItem[] = data.map(r => ({
      id:             r.id,
      tabla:          r.tabla,
      registro_id:    r.registro_id,
      accion:         r.accion as AuditAccion,
      descripcion:    r.descripcion,
      usuario_nombre: r.usuario_nombre,
      created_at:     r.created_at,
      isNew:          new Date(r.created_at) > lastSeen,
    }))

    setRawItems(notifs)
    setLoading(false)
  }, [enabled])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Realtime: cualquier acción nueva en audit_logs recarga las notificaciones
  // (no se suscribe si el usuario desactivó las notificaciones)
  useEffect(() => {
    if (!enabled) return
    const supabase = createClient()
    const channel = supabase
      .channel("audit-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
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
