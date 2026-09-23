"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { Sparkles, X, Send, Loader2, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"

interface ChatMessage { role: "user" | "model"; text: string }

const STORAGE_KEY = "adp-chatbot-history"
const WELCOME: ChatMessage = {
  role: "model",
  text: "¡Hola! Soy el asistente de ADP Gestión. Puedo explicarte cómo usar cualquier módulo del sistema o consultarte datos puntuales (inventario, reports, clientes, viajes de Transporte ADP). ¿En qué te ayudo?",
}

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [WELCOME]
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return [WELCOME]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [WELCOME]
  } catch {
    return [WELCOME]
  }
}

// Render mínimo de markdown — solo **negrita**, sin traer una librería
// completa para esto. Gemini responde con markdown liviano (negrita, listas
// numeradas) y sin esto se ven los asteriscos literales en el chat.
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export function ChatbotWidget() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input,    setInput]    = useState("")
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setMessages(loadHistory()) }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch { /* almacenamiento no disponible — no bloquea el chat */ }
  }, [messages])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // No renderizar el widget si no hay sesión (login, etc.).
  if (!user) return null

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    const next = [...messages, { role: "user" as const, text }]
    setMessages(next)
    setInput("")
    setSending(true)
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, page: pathname }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al consultar el asistente.")
      setMessages(prev => [...prev, { role: "model", text: data.text }])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar el asistente.")
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[60] w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 bg-gradient-to-r from-[var(--color-adp-blue)] to-[var(--color-adp-blue-mid)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white leading-tight">Asistente ADP</p>
                <p className="text-[10.5px] text-white/70 leading-tight truncate">Gestión · Altos del Puerto</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-4 space-y-3 bg-muted/20">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2 items-end", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "model" && (
                  <div className="h-6 w-6 rounded-full bg-[var(--color-adp-blue)] flex items-center justify-center flex-shrink-0 mb-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-background border border-border/60 text-foreground rounded-bl-sm"
                  )}
                >
                  {m.role === "model" ? renderInlineMarkdown(m.text) : m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2 items-end justify-start">
                <div className="h-6 w-6 rounded-full bg-[var(--color-adp-blue)] flex items-center justify-center flex-shrink-0 mb-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-background border border-border/60 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex-shrink-0 px-3.5 py-2 text-[11px] text-destructive bg-destructive/10 border-t border-destructive/20">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 flex items-end gap-2 p-3 border-t border-border/60 bg-card">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-[12.5px] leading-relaxed max-h-24 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="h-9 w-9 flex-shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante — orbe con degradado, sin ícono; el panel ya tiene su
          propia X para cerrar, así que este botón no necesita comunicar
          estado con un glifo, solo con su brillo/pulso. */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-[60] h-14 w-14 group"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        {/* Orbe principal — el degradado se desplaza lentamente en vez de
            pulsar, para un efecto más sutil/premium que un latido. */}
        <span
          className={cn(
            "absolute inset-0 rounded-full overflow-hidden animate-gradient-shift",
            "bg-gradient-to-br from-[var(--color-adp-celeste)] via-[var(--color-adp-blue-mid)] to-[var(--color-adp-blue)]",
            "shadow-lg shadow-[var(--color-adp-blue)]/30 ring-1 ring-white/25",
            "transition-transform duration-300 group-hover:scale-105 group-active:scale-95",
            open && "scale-90"
          )}
        >
          {/* Brillo tipo cristal, esquina superior izquierda */}
          <span className="absolute -top-2 -left-2 h-8 w-8 rounded-full bg-white/40 blur-md" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/15 via-transparent to-black/10" />
        </span>
      </button>
    </>
  )
}
