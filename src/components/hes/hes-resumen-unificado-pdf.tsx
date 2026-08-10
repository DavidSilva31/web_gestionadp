import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"

const BLUE = "#1F3864"
const GREY = "#64748B"

export interface HesResumenUnificadoPDFData {
  cliente: { nombre: string; rut: string; emails: string[]; contacto: string | null }
  filas: { label: string; cotizacion: string | null; totalUF: number; totalCLP: number }[]
  totalUF: number
  totalCLP: number
  mes: number
  anio: number
  ufValue: string
  ufDate: string
  // Ver nota en hes-resumen-pdf.tsx — necesario para poder renderizar server-side.
  logoSrc: string
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 44, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 9, color: "#1A1A1A" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottom: `1.5 solid ${BLUE}`, paddingBottom: 10, marginBottom: 18 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE },
  subtitle: { fontSize: 8.5, color: GREY, marginTop: 2 },
  genDate: { fontSize: 7, color: "#A0AEC0", marginTop: 3 },

  clienteBox: { border: "0.5 solid #E2E8F0", borderRadius: 4, padding: 12, marginBottom: 18, backgroundColor: "#F8FAFC" },
  clienteNombre: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 6 },
  clienteRow: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  clienteField: { marginRight: 18 },
  clienteLabel: { fontSize: 6.5, color: GREY, textTransform: "uppercase", letterSpacing: 0.3 },
  clienteVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 1 },

  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 8 },

  table: { border: "0.5 solid #E2E8F0", borderRadius: 2, overflow: "hidden" },
  tHeadRow: { flexDirection: "row", backgroundColor: BLUE },
  tRow: { flexDirection: "row", borderTop: "0.5 solid #E2E8F0", alignItems: "center" },
  tRowAlt: { backgroundColor: "#F8FAFC" },
  tRowTotal: { backgroundColor: "#E8EEF6", borderTop: `1 solid ${BLUE}` },

  cDesc: { width: "40%", fontSize: 7.5, padding: 7, fontFamily: "Helvetica-Bold", color: "#fff" },
  cCot:  { width: "20%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cUF:   { width: "20%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cCLP:  { width: "20%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },

  cDescV: { width: "40%", fontSize: 8, padding: 7 },
  cCotV:  { width: "20%", fontSize: 8, padding: 7, textAlign: "right" },
  cUFV:   { width: "20%", fontSize: 8, padding: 7, textAlign: "right" },
  cCLPV:  { width: "20%", fontSize: 8, padding: 7, textAlign: "right" },

  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#A0AEC0", borderTop: "0.5 solid #E2E8F0", paddingTop: 6 },
})

function fmtUF(v: number) { return v.toFixed(4) }
function fmtCLP(v: number) { return `$${Math.round(v).toLocaleString("es-CL")}` }

export function HesResumenUnificadoPDF({ data }: { data: HesResumenUnificadoPDFData }) {
  const { cliente, filas, totalUF, totalCLP, mes, anio, ufValue, ufDate, logoSrc } = data
  const periodoLabel = `${MESES[mes]} ${anio}`
  const uf = parseFloat(ufValue) || 0

  return (
    <Document title={`HES Resumen general — ${cliente.nombre} — ${periodoLabel}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Image style={s.logo} src={logoSrc} />
          <View style={s.headerRight}>
            <Text style={s.title}>Hoja de Estado de Servicio — Resumen general</Text>
            <Text style={s.subtitle}>Altos del Puerto · {periodoLabel}</Text>
            <Text style={s.genDate}>
              Generado el {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
            </Text>
          </View>
        </View>

        <View style={s.clienteBox}>
          <Text style={s.clienteNombre}>{cliente.nombre.toUpperCase()}</Text>
          <View style={s.clienteRow}>
            <View style={s.clienteField}>
              <Text style={s.clienteLabel}>RUT</Text>
              <Text style={s.clienteVal}>{cliente.rut}</Text>
            </View>
            {cliente.contacto && (
              <View style={s.clienteField}>
                <Text style={s.clienteLabel}>Contacto</Text>
                <Text style={s.clienteVal}>{cliente.contacto}</Text>
              </View>
            )}
            {cliente.emails.length > 0 && (
              <View style={s.clienteField}>
                <Text style={s.clienteLabel}>Email</Text>
                <Text style={s.clienteVal}>{cliente.emails.join(", ")}</Text>
              </View>
            )}
            <View style={s.clienteField}>
              <Text style={s.clienteLabel}>UF al {ufDate.split("-").reverse().join("/")}</Text>
              <Text style={s.clienteVal}>${uf.toLocaleString("es-CL")}</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>Resumen general — {periodoLabel}</Text>

        <View style={s.table}>
          <View style={s.tHeadRow}>
            <Text style={s.cDesc}>Tarifa / Clase</Text>
            <Text style={s.cCot}>Cotización N°</Text>
            <Text style={s.cUF}>Total (UF)</Text>
            <Text style={s.cCLP}>Total Neto ($)</Text>
          </View>
          {filas.map((r, i) => (
            <View key={i} style={[s.tRow, i % 2 !== 0 ? s.tRowAlt : {}]}>
              <Text style={s.cDescV}>{r.label}</Text>
              <Text style={s.cCotV}>{r.cotizacion ?? "—"}</Text>
              <Text style={[s.cUFV, { fontFamily: "Helvetica-Bold" }]}>{fmtUF(r.totalUF)}</Text>
              <Text style={s.cCLPV}>{fmtCLP(r.totalCLP)}</Text>
            </View>
          ))}
          <View style={[s.tRow, s.tRowTotal]}>
            <Text style={[s.cDescV, { fontFamily: "Helvetica-Bold", fontSize: 9.5, width: "60%" }]}>TOTAL GENERAL</Text>
            <Text style={[s.cUFV, { fontFamily: "Helvetica-Bold", fontSize: 9.5 }]}>{fmtUF(totalUF)} UF</Text>
            <Text style={[s.cCLPV, { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BLUE }]}>{fmtCLP(totalCLP)}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>Altos del Puerto — Logística Integral · Camino La Pólvora 106, Valparaíso</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
