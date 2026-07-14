import type { Metadata } from "next"
import { Inter, DM_Sans } from "next/font/google"
import { ThemeProvider } from "@/components/providers/theme-provider"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
})

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "ADP Gestión — Altos del Puerto",
  description: "Sistema de gestión de almacenamiento de cargas peligrosas",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema antes de que React hidrate para evitar flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem("theme");
            var dark = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (dark) { document.documentElement.classList.add("dark"); document.documentElement.style.colorScheme = "dark"; }
          } catch(e) {}
        ` }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
