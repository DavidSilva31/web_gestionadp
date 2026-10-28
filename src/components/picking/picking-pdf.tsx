import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import { ADP_LOGO_DATA_URI } from "@/lib/adp-logo-base64"
import { INCOMEX_LOGO_DATA_URI } from "@/lib/incomex-logo-base64"

// Mismo diseño que los PDF de Cotizaciones y Tarifado. Lleva una casilla por línea para ir marcando lo
// que se saca de bodega.
const NAVY = "#1a3a5c", CELESTE = "#3f9fd1", GRIS_BG = "#f4f7fa", GRIS_LN = "#e0e6ec", GRIS_TXT = "#5b6878", INK = "#1f2937"

export type PickingPDFLinea = {
  codigo: string | null; producto: string; lote: string | null; pallet: string | null; rack: string | null
  bodega: string | null; peso: number | null; posiciones: number | null; unidades: number | null
}

export type PickingPDFData = {
  numero: number
  fecha: string
  cliente: string
  referencia: string | null
  observaciones: string | null
  conPallet: boolean   // UTI Chile: pallet y rack en vez de posiciones y peso
  lineas: PickingPDFLinea[]
}

const fmt = (n: number | null) => (n == null ? "" : n.toLocaleString("es-CL", { maximumFractionDigits: 2 }))

const s = StyleSheet.create({
  page: { padding: 0, fontFamily: "Helvetica", fontSize: 8.5, color: INK, backgroundColor: "#ffffff" },
  cabecera: { paddingHorizontal: 34, paddingTop: 22, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 150, height: 50, objectFit: "contain" },
  centro: { alignItems: "center" },
  titulo: { fontSize: 13, letterSpacing: 1.5, fontFamily: "Helvetica-Bold", color: NAVY },
  numero: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  fecha: { fontSize: 8, color: GRIS_TXT, marginTop: 2 },
  acento: { height: 3, backgroundColor: CELESTE },
  cuerpo: { paddingHorizontal: 34, paddingTop: 18, paddingBottom: 60 },
  tarjeta: { backgroundColor: GRIS_BG, borderRadius: 6, padding: 12, marginBottom: 14 },
  tarjetaTit: { fontSize: 7, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  filaDato: { flexDirection: "row", marginBottom: 3 },
  datoLbl: { width: 80, fontSize: 8, color: GRIS_TXT },
  datoVal: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK },
  head: { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4, alignItems: "center" },
  th: { color: "#ffffff", fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  fila: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: GRIS_LN, alignItems: "center" },
  filaAlt: { backgroundColor: "#fafcfe" },
  td: { fontSize: 8, color: INK },
  check: { width: 14 },
  caja: { width: 8, height: 8, borderWidth: 0.8, borderColor: NAVY, borderRadius: 1 },
  sku: { width: 52 },
  prod: { flex: 1, paddingRight: 6 },
  lote: { width: 62 },
  pallet: { width: 46 },
  rack: { width: 52 },
  bodega: { width: 44 },
  peso: { width: 38, textAlign: "right" },
  num: { width: 32, textAlign: "right" },
  totales: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, gap: 16 },
  totTxt: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY },
  obsTitulo: { fontSize: 7.5, letterSpacing: 1.2, color: CELESTE, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  obsTxt: { fontSize: 8, color: INK, lineHeight: 1.4 },
  firmas: { flexDirection: "row", gap: 40, marginTop: 36 },
  firma: { flex: 1, borderTopWidth: 0.8, borderTopColor: NAVY, paddingTop: 4 },
  firmaTxt: { fontSize: 7.5, color: GRIS_TXT },
  pie: { position: "absolute", bottom: 22, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: GRIS_LN, paddingTop: 6 },
  pieTxt: { fontSize: 6.5, color: GRIS_TXT },
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

export function PickingPDF({ data }: { data: PickingPDFData }) {
  const totPos = data.lineas.reduce((a, l) => a + (l.posiciones ?? 0), 0)
  const totUnd = data.lineas.reduce((a, l) => a + (l.unidades ?? 0), 0)

  return (
    <Document title={`Picking ${data.numero}`} author="Altos del Puerto">
      <Page size="LETTER" style={s.page}>
        <View>
          <View style={s.cabecera}>
            <Image src={INCOMEX_LOGO_DATA_URI} style={s.logo} />
            <View style={s.centro}>
              <Text style={s.titulo}>PICKING</Text>
              <Text style={s.numero}>N° {data.numero}</Text>
              <Text style={s.fecha}>{data.fecha}</Text>
            </View>
            <Image src={ADP_LOGO_DATA_URI} style={s.logo} />
          </View>
          <View style={s.acento} />
        </View>

        <View style={s.cuerpo}>
          <View style={s.tarjeta}>
            <Text style={s.tarjetaTit}>CLIENTE</Text>
            <Dato label="Cliente" valor={data.cliente} />
            <Dato label="Referencia" valor={data.referencia} />
          </View>

          <View style={s.head} wrap={false}>
            <View style={s.check} />
            <Text style={[s.th, s.sku]}>SKU</Text>
            <Text style={[s.th, s.prod]}>PRODUCTO</Text>
            <Text style={[s.th, s.lote]}>LOTE</Text>
            {data.conPallet ? (
              <>
                <Text style={[s.th, s.pallet]}>PALLET</Text>
                <Text style={[s.th, s.rack]}>RACK</Text>
              </>
            ) : (
              <Text style={[s.th, s.peso]}>PESO</Text>
            )}
            <Text style={[s.th, s.bodega]}>BODEGA</Text>
            {!data.conPallet && <Text style={[s.th, s.num]}>POS.</Text>}
            <Text style={[s.th, s.num]}>UND.</Text>
          </View>
          {data.lineas.map((l, i) => (
            <View key={i} style={[s.fila, i % 2 === 1 ? s.filaAlt : {}]} wrap={false}>
              <View style={s.check}><View style={s.caja} /></View>
              <Text style={[s.td, s.sku]}>{l.codigo ?? ""}</Text>
              <Text style={[s.td, s.prod]}>{l.producto}</Text>
              <Text style={[s.td, s.lote]}>{l.lote ?? ""}</Text>
              {data.conPallet ? (
                <>
                  <Text style={[s.td, s.pallet]}>{l.pallet ?? ""}</Text>
                  <Text style={[s.td, s.rack]}>{l.rack ?? ""}</Text>
                </>
              ) : (
                <Text style={[s.td, s.peso]}>{fmt(l.peso)}</Text>
              )}
              <Text style={[s.td, s.bodega]}>{l.bodega ?? ""}</Text>
              {!data.conPallet && <Text style={[s.td, s.num]}>{fmt(l.posiciones)}</Text>}
              <Text style={[s.td, s.num]}>{fmt(l.unidades)}</Text>
            </View>
          ))}

          <View style={s.totales} wrap={false}>
            <Text style={s.totTxt}>{data.lineas.length} línea{data.lineas.length === 1 ? "" : "s"}</Text>
            {!data.conPallet && <Text style={s.totTxt}>{fmt(totPos)} posiciones</Text>}
            <Text style={s.totTxt}>{fmt(totUnd)} unidades</Text>
          </View>

          {data.observaciones && (
            <View wrap={false}>
              <Text style={s.obsTitulo}>OBSERVACIONES</Text>
              <Text style={s.obsTxt}>{data.observaciones}</Text>
            </View>
          )}

          <View style={s.firmas} wrap={false}>
            <View style={s.firma}><Text style={s.firmaTxt}>Preparado por</Text></View>
            <View style={s.firma}><Text style={s.firmaTxt}>Revisado por</Text></View>
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
