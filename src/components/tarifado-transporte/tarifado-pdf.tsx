import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import { ADP_LOGO_DATA_URI } from "@/lib/adp-logo-base64"
import { INCOMEX_LOGO_DATA_URI } from "@/lib/incomex-logo-base64"
import { TRAMOS_DIESEL } from "@/lib/tarifado-transporte-pdf-build"

// Mismo diseño que el PDF de Cotizaciones (cotizacion-pdf.tsx), en horizontal para que
// quepan los 7 tramos del diésel.
const NAVY     = "#1a3a5c"
const CELESTE  = "#3f9fd1"
const GRIS_BG  = "#f4f7fa"
const GRIS_LN  = "#e0e6ec"
const GRIS_TXT = "#5b6878"
const INK      = "#1f2937"

export type TarifadoPDFData = {
  numero:   string
  fecha:    string
  vigenciaDesde: string | null
  emisor:   { nombre: string; direccion: string; telefono: string; email: string; web: string }
  cliente:  { razonSocial: string; rut: string | null; ciudad: string | null; direccion: string | null }
  atencion: string | null
  lineas:   { trayecto: string; capacidad: string; ufPreAlza: number | null; valoresUF: number[]; resaltados: number[] }[]
  observaciones: string[]
  firma:    { nombre: string; cargo: string; telefono: string; email: string; imagenUri?: string }
}

const fmtUF = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const ANCHO_CAP = 44
const ANCHO_TRAMO = 58

const s = StyleSheet.create({
  page:        { padding: 0, fontFamily: "Helvetica", fontSize: 8.5, color: INK, backgroundColor: "#ffffff" },
  cabecera:    { paddingHorizontal: 34, paddingTop: 22, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logoCabecera: { width: 150, height: 50, objectFit: "contain" },
  cabeceraCentro: { alignItems: "center" },
  cabeceraTitulo: { fontSize: 13, letterSpacing: 1.5, fontFamily: "Helvetica-Bold", color: NAVY },
  cabeceraNum: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  cabeceraFecha: { fontSize: 8, color: GRIS_TXT, marginTop: 2 },
  acento:      { height: 3, backgroundColor: CELESTE },
  cuerpo:      { paddingHorizontal: 34, paddingTop: 18, paddingBottom: 50 },
  emisorRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  emisorNom:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY },
  emisorDet:   { fontSize: 7.5, color: GRIS_TXT, marginTop: 2, lineHeight: 1.4 },
  tarjeta:     { backgroundColor: GRIS_BG, borderRadius: 6, padding: 12, marginBottom: 14 },
  tarjetaTit:  { fontSize: 7, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  filaDato:    { flexDirection: "row", marginBottom: 3 },
  datoLbl:     { width: 90, fontSize: 8, color: GRIS_TXT },
  datoVal:     { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK },
  // Banda celeste sobre los 7 tramos: deja claro que esas columnas son los tramos del valor del diésel.
  superHead:   { flexDirection: "row", justifyContent: "flex-end" },
  superBanda:  { backgroundColor: CELESTE, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingVertical: 5, alignItems: "center" },
  superTxt:    { fontSize: 8.5, letterSpacing: 0.6, color: "#ffffff", fontFamily: "Helvetica-Bold", textAlign: "center" },
  superSub:    { fontSize: 7, color: "#e6f3fa", marginTop: 1.5 },
  tablaHead:   { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, alignItems: "center" },
  thTxt:       { color: "#ffffff", fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  thSub:       { color: "#c9d8e6", fontSize: 6, marginTop: 1 },
  fila:        { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: GRIS_LN, alignItems: "center" },
  filaAlt:     { backgroundColor: "#fafcfe" },
  tdTxt:       { fontSize: 8, color: INK },
  colTray:     { flex: 1, paddingRight: 8 },
  colCap:      { width: ANCHO_CAP, textAlign: "center" },
  colTramo:    { width: ANCHO_TRAMO, textAlign: "right" },
  // Casilla resaltada: fondo amarillo tipo marcador, con margen para no juntarse con las vecinas.
  resaltada:   { backgroundColor: "#fde047", borderRadius: 2, paddingVertical: 2, paddingHorizontal: 4, marginVertical: -2 },
  resaltadaTxt: { fontFamily: "Helvetica-Bold" },
  vigencia:    { marginTop: 10, fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY },
  firmaBox:    { width: 220, paddingTop: 6, marginTop: 16 },
  firmaImg:    { width: 170, height: 115, objectFit: "contain", marginLeft: 10 },
  firmaLinea:  { borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 6 },
  firmaNom:    { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY },
  firmaCargo:  { fontSize: 7.5, color: GRIS_TXT, marginTop: 1 },
  obsTitulo:   { fontSize: 7.5, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  obsItem:     { flexDirection: "row", marginBottom: 4 },
  obsPunto:    { width: 10, color: CELESTE, fontSize: 9 },
  obsTxt:      { flex: 1, fontSize: 8, color: INK, lineHeight: 1.4 },
  pie:         { position: "absolute", bottom: 22, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: GRIS_LN, paddingTop: 6 },
  pieTxt:      { fontSize: 6.5, color: GRIS_TXT },
})

function Dato({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null
  return (
    <View style={s.filaDato}>
      <Text style={s.datoLbl}>{label}</Text>
      <Text style={s.datoVal}>{valor}</Text>
    </View>
  )
}

export function TarifadoPDF({ data }: { data: TarifadoPDFData }) {
  return (
    <Document title={`Tarifado Transporte ${data.numero}`} author="Altos del Puerto">
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View>
          <View style={s.cabecera}>
            <Image src={INCOMEX_LOGO_DATA_URI} style={s.logoCabecera} />
            <View style={s.cabeceraCentro}>
              <Text style={s.cabeceraTitulo}>TARIFADO TRANSPORTE</Text>
              <Text style={s.cabeceraNum}>N° {data.numero}</Text>
              <Text style={s.cabeceraFecha}>{data.fecha}</Text>
            </View>
            <Image src={ADP_LOGO_DATA_URI} style={s.logoCabecera} />
          </View>
          <View style={s.acento} />
        </View>

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
          </View>

          <View style={s.superHead}>
            <View style={[s.superBanda, { width: ANCHO_TRAMO * TRAMOS_DIESEL.length + 8 }]}>
              <Text style={s.superTxt}>TRAMOS DE VALOR DEL DIÉSEL (CLP/litro)</Text>
              <Text style={s.superSub}>Tarifa escalonada en UF por viaje, según el valor del diésel</Text>
            </View>
          </View>
          <View style={s.tablaHead} wrap={false}>
            <Text style={[s.thTxt, s.colTray]}>TRAYECTO</Text>
            <Text style={[s.thTxt, s.colCap]}>CAPACIDAD</Text>
            {TRAMOS_DIESEL.map(t => (
              <View key={t} style={s.colTramo}>
                <Text style={[s.thTxt, { textAlign: "right" }]}>{t} <Text style={s.thSub}>CLP</Text></Text>
                <Text style={[s.thSub, { textAlign: "right" }]}>UF/VIAJE</Text>
              </View>
            ))}
          </View>
          {data.lineas.map((l, i) => (
            <View key={i} style={[s.fila, i % 2 === 1 ? s.filaAlt : {}]} wrap={false}>
              <Text style={[s.tdTxt, s.colTray]}>{l.trayecto}</Text>
              <Text style={[s.tdTxt, s.colCap]}>{l.capacidad}</Text>
              {TRAMOS_DIESEL.map((t, j) => {
                const resaltada = l.resaltados.includes(j)
                return (
                  <View key={t} style={[s.colTramo, { alignItems: "flex-end" }]}>
                    <View style={resaltada ? s.resaltada : {}}>
                      <Text style={[s.tdTxt, resaltada ? s.resaltadaTxt : {}]}>{l.valoresUF[j] != null ? fmtUF(l.valoresUF[j]) : ""}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ))}

          {data.vigenciaDesde && <Text style={s.vigencia}>* Tarifas rigen a contar del {data.vigenciaDesde}.</Text>}

          {data.observaciones.length > 0 && (
            <View wrap={false}>
              <Text style={s.obsTitulo}>OBSERVACIONES</Text>
              {data.observaciones.map((t, i) => (
                <View key={i} style={s.obsItem}>
                  <Text style={s.obsPunto}>•</Text>
                  <Text style={s.obsTxt}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.firmaBox} wrap={false}>
            {data.firma.imagenUri && <Image src={data.firma.imagenUri} style={s.firmaImg} />}
            <View style={s.firmaLinea}>
              <Text style={s.firmaNom}>{data.firma.nombre}</Text>
              <Text style={s.firmaCargo}>{data.firma.cargo}</Text>
              <Text style={s.firmaCargo}>{data.firma.telefono}  ·  {data.firma.email}</Text>
            </View>
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTxt}>Altos del Puerto · Logística Integral</Text>
          <Text style={s.pieTxt} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
