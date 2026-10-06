import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import { ADP_LOGO_DATA_URI } from "@/lib/adp-logo-base64"
import { INCOMEX_LOGO_DATA_URI } from "@/lib/incomex-logo-base64"

const NAVY     = "#1a3a5c"
const CELESTE  = "#3f9fd1"
const GRIS_BG  = "#f4f7fa"
const GRIS_LN  = "#e0e6ec"
const GRIS_TXT = "#5b6878"
const INK      = "#1f2937"

export type CotizacionLinea = {
  cantidad:    number
  descripcion: string
  valorUF:     number
  valorPesos:  number
}

export type CotizacionObservacion = {
  tipo:  string
  texto: string
}

export type CotizacionPDFData = {
  numero:          number
  fecha:           string
  emisor:          { nombre: string; direccion: string; telefono: string; email: string; web: string }
  cliente:         { razonSocial: string; rut: string | null; ciudad: string | null; direccion: string | null }
  atencion:        string | null
  valorUF:         number
  lineas:          CotizacionLinea[]
  neto:            number
  iva:             number
  total:           number
  observaciones:   CotizacionObservacion[]
  observacionesExtra: string | null
  firma:           { nombre: string; cargo: string; telefono: string; email: string; imagenUri?: string }
}

const fmtCL = (n: number, dec = 0) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const s = StyleSheet.create({
  page:        { padding: 0, fontFamily: "Helvetica", fontSize: 8.5, color: INK, backgroundColor: "#ffffff" },
  cabecera:    { paddingHorizontal: 34, paddingTop: 22, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logoCabecera: { width: 150, height: 50, objectFit: "contain" },
  cabeceraCentro: { alignItems: "center" },
  cabeceraTitulo: { fontSize: 13, letterSpacing: 1.5, fontFamily: "Helvetica-Bold", color: NAVY },
  cabeceraNum: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  cabeceraFecha: { fontSize: 8, color: GRIS_TXT, marginTop: 2 },
  acento:      { height: 3, backgroundColor: CELESTE },
  cuerpo:      { paddingHorizontal: 34, paddingTop: 22, paddingBottom: 60 },
  emisorRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  emisorNom:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY },
  emisorDet:   { fontSize: 7.5, color: GRIS_TXT, marginTop: 2, lineHeight: 1.4 },
  tarjeta:     { backgroundColor: GRIS_BG, borderRadius: 6, padding: 12, marginBottom: 18 },
  tarjetaTit:  { fontSize: 7, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  filaDato:    { flexDirection: "row", marginBottom: 3 },
  datoLbl:     { width: 90, fontSize: 8, color: GRIS_TXT },
  datoVal:     { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK },
  tablaHead:   { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4 },
  thTxt:       { color: "#ffffff", fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  fila:        { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: GRIS_LN },
  filaAlt:     { backgroundColor: "#fafcfe" },
  tdTxt:       { fontSize: 8.5, color: INK },
  colCant:     { width: 42, textAlign: "center" },
  colDesc:     { flex: 1, paddingRight: 10 },
  colUF:       { width: 80, textAlign: "right" },
  colTotal:    { width: 90, textAlign: "right" },
  bloqueFin:   { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  firmaBox:    { width: 220, paddingTop: 6 },
  firmaImg:    { width: 170, height: 115, objectFit: "contain", marginLeft: 10 },
  firmaLinea:  { borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 6 },
  firmaNom:    { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY },
  firmaCargo:  { fontSize: 7.5, color: GRIS_TXT, marginTop: 1 },
  totales:     { width: 200, backgroundColor: GRIS_BG, borderRadius: 6, padding: 12 },
  totFila:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totLbl:      { fontSize: 8, color: GRIS_TXT },
  totVal:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK },
  totFinal:    { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 0.8, borderTopColor: NAVY },
  totFinalLbl: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY },
  totFinalVal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY },
  obsTitulo:   { fontSize: 7.5, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 6 },
  obsItem:     { flexDirection: "row", marginBottom: 4 },
  obsPunto:    { width: 10, color: CELESTE, fontSize: 9 },
  obsTxt:      { flex: 1, fontSize: 8, color: INK, lineHeight: 1.4 },
  pie:         { position: "absolute", bottom: 22, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: GRIS_LN, paddingTop: 6 },
  pieTxt:      { fontSize: 6.5, color: GRIS_TXT },
})

function Banda({ data }: { data: CotizacionPDFData }) {
  return (
    <View>
      <View style={s.cabecera}>
        <Image src={INCOMEX_LOGO_DATA_URI} style={s.logoCabecera} />
        <View style={s.cabeceraCentro}>
          <Text style={s.cabeceraTitulo}>COTIZACIÓN</Text>
          <Text style={s.cabeceraNum}>N° {fmtCL(data.numero)}</Text>
          <Text style={s.cabeceraFecha}>{data.fecha}</Text>
        </View>
        <Image src={ADP_LOGO_DATA_URI} style={s.logoCabecera} />
      </View>
      <View style={s.acento} />
    </View>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null
  return (
    <View style={s.filaDato}>
      <Text style={s.datoLbl}>{label}</Text>
      <Text style={s.datoVal}>{valor}</Text>
    </View>
  )
}

export function CotizacionPDF({ data }: { data: CotizacionPDFData }) {
  const lineasValidas = data.lineas.filter(l => l.descripcion.trim() !== "")
  const obsPorTipo = data.observaciones.reduce<Record<string, string[]>>((acc, o) => {
    (acc[o.tipo] ??= []).push(o.texto)
    return acc
  }, {})

  return (
    <Document title={`Cotización ${data.numero}`} author="Altos del Puerto">
      <Page size="LETTER" style={s.page}>
        <Banda data={data} />

        <View style={s.cuerpo}>
          <View style={s.emisorRow}>
            <View>
              <Text style={s.emisorNom}>{data.emisor.nombre}</Text>
              <Text style={s.emisorDet}>{data.emisor.direccion}</Text>
              <Text style={s.emisorDet}>{[data.emisor.telefono, data.emisor.email, data.emisor.web].filter(Boolean).join("  ·  ")}</Text>
            </View>
          </View>

          <View style={s.tarjeta}>
            <Text style={s.tarjetaTit}>CLIENTE</Text>
            <Dato label="Razón social" valor={data.cliente.razonSocial} />
            <Dato label="RUT"          valor={data.cliente.rut} />
            <Dato label="Atención"     valor={data.atencion} />
            <Dato label="Ciudad"       valor={data.cliente.ciudad} />
            <Dato label="Dirección"    valor={data.cliente.direccion} />
            <Dato label="Valor UF"     valor={`$ ${fmtCL(data.valorUF, 2)}`} />
          </View>

          <View style={s.tablaHead}>
            <Text style={[s.thTxt, s.colCant]}>CANT.</Text>
            <Text style={[s.thTxt, s.colDesc]}>DESCRIPCIÓN</Text>
            <Text style={[s.thTxt, s.colUF]}>UNIT. (UF)</Text>
            <Text style={[s.thTxt, s.colTotal]}>TOTAL ($)</Text>
          </View>
          {lineasValidas.map((l, i) => (
            <View key={i} style={[s.fila, i % 2 === 1 ? s.filaAlt : {}]} wrap={false}>
              <Text style={[s.tdTxt, s.colCant]}>{l.cantidad}</Text>
              <Text style={[s.tdTxt, s.colDesc]}>{l.descripcion}</Text>
              <Text style={[s.tdTxt, s.colUF]}>{fmtCL(l.valorUF, 3)}</Text>
              <Text style={[s.tdTxt, s.colTotal]}>{fmtCL(l.valorPesos)}</Text>
            </View>
          ))}

          <View style={s.bloqueFin}>
            <View style={s.firmaBox}>
              {data.firma.imagenUri && <Image src={data.firma.imagenUri} style={s.firmaImg} />}
              <View style={s.firmaLinea}>
                <Text style={s.firmaNom}>{data.firma.nombre}</Text>
                <Text style={s.firmaCargo}>{data.firma.cargo}</Text>
                <Text style={s.firmaCargo}>{data.firma.telefono}  ·  {data.firma.email}</Text>
              </View>
            </View>

            <View style={s.totales}>
              <View style={s.totFila}><Text style={s.totLbl}>Neto</Text><Text style={s.totVal}>$ {fmtCL(data.neto)}</Text></View>
              <View style={s.totFila}><Text style={s.totLbl}>IVA 19%</Text><Text style={s.totVal}>$ {fmtCL(data.iva)}</Text></View>
              <View style={s.totFinal}>
                <Text style={s.totFinalLbl}>Total</Text>
                <Text style={s.totFinalVal}>$ {fmtCL(data.total)}</Text>
              </View>
            </View>
          </View>

          {Object.entries(obsPorTipo).map(([tipo, textos]) => (
            <View key={tipo} wrap={false}>
              <Text style={s.obsTitulo}>{tipo.toUpperCase()}</Text>
              {textos.map((t, i) => (
                <View key={i} style={s.obsItem}>
                  <Text style={s.obsPunto}>•</Text>
                  <Text style={s.obsTxt}>{t}</Text>
                </View>
              ))}
            </View>
          ))}

          {data.observacionesExtra && (
            <View wrap={false}>
              <Text style={s.obsTitulo}>OBSERVACIONES</Text>
              <Text style={s.obsTxt}>{data.observacionesExtra}</Text>
            </View>
          )}
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTxt}>Altos del Puerto · Logística Integral</Text>
          <Text style={s.pieTxt} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
