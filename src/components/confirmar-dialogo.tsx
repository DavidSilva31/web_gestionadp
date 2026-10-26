"use client"

import { Loader2, Trash2 } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Confirmación con el diseño de la web (reemplaza a window.confirm del navegador, que sale con otro estilo).
export function ConfirmarDialogo({
  abierto, titulo, descripcion, confirmar = "Eliminar", ocupado = false, error,
  onConfirmar, onCancelar,
}: {
  abierto: boolean
  titulo: string
  descripcion: React.ReactNode
  confirmar?: string
  ocupado?: boolean
  error?: string | null
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={open => { if (!open && !ocupado) onCancelar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </span>
            {titulo}
          </AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={ocupado}
            onClick={onConfirmar}
            className="gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
          >
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
