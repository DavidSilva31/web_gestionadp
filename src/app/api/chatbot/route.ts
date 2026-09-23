import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI, type Content } from "@google/genai"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { SYSTEM_KNOWLEDGE } from "@/lib/chatbot-knowledge"
import { CHATBOT_TOOLS, runChatbotTool } from "@/lib/chatbot-tools"

export const runtime = "nodejs"

interface ChatMessage { role: "user" | "model"; text: string }
interface ReqBody { messages: ChatMessage[]; page?: string }

const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"
const MAX_TOOL_ROUNDS = 5

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  return status === 503 || status === 429
}

// Modelos nuevos/con mucha demanda devuelven 503 "UNAVAILABLE" con cierta
// frecuencia aunque la key y la request estén perfectas — es congestión del
// lado de Google, no un error nuestro. Reintenta un par de veces con backoff
// antes de rendirse, en vez de mostrarle el error al usuario a la primera.
async function generateWithRetry(
  ai: GoogleGenAI, params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
) {
  const delays = [800, 2000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(params)
    } catch (err) {
      if (attempt >= delays.length || !isRetryable(err)) throw err
      await new Promise(res => setTimeout(res, delays[attempt]))
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleChat(req)
  } catch (err) {
    if (isRetryable(err)) {
      console.warn("[chatbot] Gemini con alta demanda tras reintentos:", err)
      return NextResponse.json(
        { error: "El asistente está con mucha demanda en este momento — intenta de nuevo en unos segundos." },
        { status: 503 }
      )
    }
    console.error("[chatbot] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del asistente. Intenta de nuevo." }, { status: 500 })
  }
}

async function handleChat(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "El asistente no está configurado todavía (falta GEMINI_API_KEY)." },
      { status: 503 }
    )
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("nombre, role").eq("id", user.id).single()

  const body = (await req.json()) as ReqBody
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Falta el mensaje del usuario." }, { status: 400 })
  }
  // Tope defensivo — evita mandar historiales gigantes a la API por error del cliente.
  const trimmed = messages.slice(-30)

  const ai = new GoogleGenAI({ apiKey })

  const contents: Content[] = trimmed.map(m => ({ role: m.role, parts: [{ text: m.text }] }))

  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null
  const systemInstruction = `${SYSTEM_KNOWLEDGE}\n\nUsuario actual: ${profile?.nombre ?? "desconocido"} (rol: ${profile?.role ?? "desconocido"}).${
    page ? `\nPantalla que el usuario tiene abierta ahora mismo: ${page} — si la pregunta es genérica ("¿qué hago acá?", "¿cómo funciona esto?", "explícame esta pantalla"), respóndela en base a ese módulo específico antes que nada.` : ""
  }`

  let finalText = ""
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await generateWithRetry(ai, {
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: CHATBOT_TOOLS }],
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    })

    const calls = response.functionCalls
    if (!calls || calls.length === 0) {
      finalText = response.text ?? ""
      break
    }

    // El modelo pidió usar herramientas — se ejecutan (solo lectura, con el
    // cliente Supabase del propio usuario) y se le devuelve el resultado para
    // que siga razonando o entregue la respuesta final. Importante: se
    // reenvían los parts CRUDOS de la respuesta (no reconstruidos a mano),
    // porque los modelos "thinking" (ej. gemini-3.6-flash) adjuntan un
    // thoughtSignature junto a cada functionCall que la API exige recibir
    // de vuelta tal cual en el siguiente turno — omitirlo tira 400.
    const modelParts = response.candidates?.[0]?.content?.parts
    contents.push({ role: "model", parts: modelParts ?? calls.map(c => ({ functionCall: c })) })
    const responseParts = await Promise.all(calls.map(async c => {
      const result = await runChatbotTool(supabase, c.name ?? "", c.args ?? {})
      return { functionResponse: { name: c.name, response: { result } } }
    }))
    contents.push({ role: "user", parts: responseParts })
  }

  if (!finalText) {
    finalText = "No pude terminar de procesar la consulta — intenta reformularla o pregunta algo más puntual."
  }

  return NextResponse.json({ text: finalText })
}
