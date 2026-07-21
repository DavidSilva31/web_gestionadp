"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

interface NavigationPendingValue {
  pending: boolean
  startPending: () => void
}

const NavigationPendingContext = createContext<NavigationPendingValue>({
  pending: false,
  startPending: () => {},
})

// Tiempo máximo que se muestra el overlay si por algún motivo la navegación
// nunca completa (ej. error de red) — evita dejarlo pegado indefinidamente.
const MAX_PENDING_MS = 8000

export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // La navegación terminó en cuanto el pathname cambia — el nuevo segmento
  // ya montó y toma el control de su propio loading state (si aplica).
  useEffect(() => {
    setPending(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [pathname])

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  const startPending = useCallback(() => {
    setPending(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setPending(false), MAX_PENDING_MS)
  }, [])

  return (
    <NavigationPendingContext.Provider value={{ pending, startPending }}>
      {children}
    </NavigationPendingContext.Provider>
  )
}

export function useNavigationPending() {
  return useContext(NavigationPendingContext)
}
