import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"

const BLUE = "#1F3864"
const GREY = "#64748B"
const AMBER_BG = "#FFF8E1"
const AMBER_TXT = "#7B3C00"

export interface HesResumenPDFData {
  cliente: { nombre: string; rut: string; email: string | null; contacto: string | null }
  tarifa:  { cotizacion_numero: string; clase_imo: string | null }
  billing: {
    rows: { label: string; qty: number | string; unit: string; tarifa: number; totalUF: number }[]
    finalUF: number
    finalCLP: number
    hasMin: boolean
  }
  mes: number
  anio: number
  ufValue: string
  ufDate: string
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
  tRowMin: { backgroundColor: AMBER_BG },
  tRowTotal: { backgroundColor: "#E8EEF6", borderTop: `1 solid ${BLUE}` },

  cDesc:   { width: "34%", fontSize: 7.5, padding: 7, fontFamily: "Helvetica-Bold", color: "#fff" },
  cQty:    { width: "16%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cTarifa: { width: "16%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cUF:     { width: "17%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cCLP:    { width: "17%", fontSize: 7.5, padding: 7, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },

  cDescV:   { width: "34%", fontSize: 8, padding: 7 },
  cQtyV:    { width: "16%", fontSize: 8, padding: 7, textAlign: "right" },
  cTarifaV: { width: "16%", fontSize: 8, padding: 7, textAlign: "right" },
  cUFV:     { width: "17%", fontSize: 8, padding: 7, textAlign: "right" },
  cCLPV:    { width: "17%", fontSize: 8, padding: 7, textAlign: "right" },

  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#A0AEC0", borderTop: "0.5 solid #E2E8F0", paddingTop: 6 },
})

function fmtUF(v: number) { return v.toFixed(4) }
function fmtCLP(v: number) { return `$${Math.round(v).toLocaleString("es-CL")}` }

export function HesResumenPDF({ data }: { data: HesResumenPDFData }) {
  const { cliente, tarifa, billing, mes, anio, ufValue, ufDate } = data
  const periodoLabel = `${MESES[mes]} ${anio}`
  const uf = parseFloat(ufValue) || 0

  return (
    <Document title={`HES Resumen — ${cliente.nombre} — ${periodoLabel}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Image style={s.logo} src={`${window.location.origin}/adp_logo_hd.png`} />
          <View style={s.headerRight}>
            <Text style={s.title}>Hoja de Estado de Servicio — Resumen</Text>
            <Text style={s.subtitle}>Altos del Puerto · {periodoLabel}</Text>
            <Text style={s.genDate}>
              Generado el {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
            </Text>
          </View>
        </View>

        <View style={s.clienteBox}>
          <Text style={s.clienteNombre}>
            {cliente.nombre.toUpperCase()}{tarifa.clase_imo ? ` — CLASE ${tarifa.clase_imo.toUpperCase()}` : ""}
          </Text>
          <View style={s.clienteRow}>
            <View style={s.clienteField}>
              <Text style={s.clienteLabel}>RUT</Text>
              <Text style={s.clienteVal}>{cliente.rut}</Text>
            </View>
            <View style={s.clienteField}>
              <Text style={s.clienteLabel}>Cotización N°</Text>
              <Text style={s.clienteVal}>{tarifa.cotizacion_numero}</Text>
            </View>
            {cliente.contacto && (
              <View style={s.clienteField}>
                <Text style={s.clienteLabel}>Contacto</Text>
                <Text style={s.clienteVal}>{cliente.contacto}</Text>
              </View>
            )}
            {cliente.email && (
              <View style={s.clienteField}>
                <Text style={s.clienteLabel}>Email</Text>
                <Text style={s.clienteVal}>{cliente.email}</Text>
              </View>
            )}
            <View style={s.clienteField}>
              <Text style={s.clienteLabel}>UF al {ufDate.split("-").reverse().join("/")}</Text>
              <Text style={s.clienteVal}>${uf.toLocaleString("es-CL")}</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>Resumen de cobro — {periodoLabel}</Text>

        <View style={s.table}>
          <View style={s.tHeadRow}>
            <Text style={s.cDesc}>Descripción</Text>
            <Text style={s.cQty}>Cantidad</Text>
            <Text style={s.cTarifa}>Tarifa (UF)</Text>
            <Text style={s.cUF}>Total Neto (UF)</Text>
            <Text style={s.cCLP}>Total Neto ($)</Text>
          </View>
          {billing.rows.map((r, i) => (
            <View key={i} style={[s.tRow, i % 2 !== 0 ? s.tRowAlt : {}]}>
              <Text style={s.cDescV}>{r.label}</Text>
              <Text style={s.cQtyV}>{typeof r.qty === "number" ? r.qty.toLocaleString("es-CL") : r.qty} {r.unit}</Text>
              <Text style={s.cTarifaV}>{fmtUF(r.tarifa)}</Text>
              <Text style={[s.cUFV, { fontFamily: "Helvetica-Bold" }]}>{fmtUF(r.totalUF)}</Text>
              <Text style={s.cCLPV}>{fmtCLP(r.totalUF * uf)}</Text>
            </View>
          ))}
          {billing.hasMin && (
            <View style={[s.tRow, s.tRowMin]}>
              <Text style={[s.cDescV, { fontFamily: "Helvetica-Bold", color: AMBER_TXT, width: "66%" }]}>
                Facturación mínima aplicada
              </Text>
              <Text style={[s.cUFV, { fontFamily: "Helvetica-Bold", color: AMBER_TXT }]}>{fmtUF(billing.finalUF)}</Text>
              <Text style={[s.cCLPV, { color: AMBER_TXT }]}>{fmtCLP(billing.finalCLP)}</Text>
            </View>
          )}
          <View style={[s.tRow, s.tRowTotal]}>
            <Text style={[s.cDescV, { fontFamily: "Helvetica-Bold", fontSize: 9.5, width: "66%" }]}>TOTAL NETO</Text>
            <Text style={[s.cUFV, { fontFamily: "Helvetica-Bold", fontSize: 9.5 }]}>{fmtUF(billing.finalUF)} UF</Text>
            <Text style={[s.cCLPV, { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BLUE }]}>{fmtCLP(billing.finalCLP)}</Text>
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
