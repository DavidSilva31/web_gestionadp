"use client"

import { useEffect, useRef } from "react"

// Los modales/popups de la app no cambian la URL, así que el historial del
// navegador no sabe que están abiertos — si el usuario presiona "atrás" con
// uno abierto, el navegador salta directo al módulo anterior en vez de solo
// cerrar el modal. Este hook empuja una entrada "fantasma" al historial
// mientras el modal está abierto y escucha popstate para cerrarlo en ese
// caso; si el modal se cierra por cualquier otra vía (botón Cancelar, X,
// Escape, guardar), retira esa misma entrada al desmontar para no dejar un
// "salto en falso" la próxima vez que alguien presione atrás.
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!open) return

    const t = setTimeout(() => {
      window.history.pushState({ __modal: true }, "")
      pushedRef.current = true
    }, 0)

    function onPopState() {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener("popstate", onPopState)

    return () => {
      clearTimeout(t)
      window.removeEventListener("popstate", onPopState)
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose se lee vía ref a propósito: incluirlo en deps volvería a empujar una entrada al historial en cada render que pase una closure nueva.
  }, [open])
}
