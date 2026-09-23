import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import { ADP_LOGO_DATA_URI } from "@/lib/adp-logo-base64"
import type { Report, ReportBodegajeItem } from "@/types/database"
import type { FirmaPdf, FirmasPdf } from "@/lib/report-firmas"

const BLUE = "#1a3a5c"

const s = StyleSheet.create({
  page: { padding: 22, fontFamily: "Helvetica", fontSize: 8, color: "#000" },

  // Header
  header: { flexDirection: "row", alignItems: "center", borderBottom: "1.5 solid #000", paddingBottom: 6, marginBottom: 8 },
  headerLogo: { width: 120, height: 52, objectFit: "contain" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textAlign: "center" },
  headerNumRow: { flexDirection: "row", alignItems: "baseline", marginTop: 3, gap: 6 },
  headerNumLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  headerNum: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 3 },

  // Antecedentes
  ante: { border: "0.5 solid #000", padding: 6, marginBottom: 6 },
  anteTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  row: { flexDirection: "row", marginBottom: 4, alignItems: "flex-end", flexWrap: "wrap" },

  // Field
  fLabel: { fontSize: 7.5 },
  fVal: { fontSize: 8, fontFamily: "Helvetica-Bold", borderBottom: "0.5 solid #000", minWidth: 55, paddingBottom: 1, marginLeft: 2, marginRight: 10 },
  fValLong: { minWidth: 160 },
  fValMed: { minWidth: 90 },
  fValShort: { minWidth: 40 },

  // Section box
  secBox: { border: "0.5 solid #000", padding: 6, marginBottom: 6 },
  secTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginBottom: 5 },
  // Sección sin datos (no activa) — reemplaza todos sus campos por un solo
  // "N/A" en vez de mostrar la grilla completa vacía.
  secNA: { fontSize: 8, fontFamily: "Helvetica-Oblique", color: "#666" },

  // Checkbox row
  cbRow: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 },
  cb: { width: 9, height: 9, border: "1 solid #000", marginRight: 3, alignItems: "center", justifyContent: "center" },
  // Relleno sólido en vez de un glyph "✓" — Helvetica (la única fuente que
  // usa este PDF) no tiene ese carácter en su set, así que el check nunca se
  // dibujaba y todas las casillas se veían vacías sin importar el valor real.
  cbFill: { width: 5, height: 5, backgroundColor: "#000" },
  cbLabel: { fontSize: 7.5 },

  // Obs box
  obsBox: { border: "0.5 solid #000", minHeight: 28, padding: 3, marginTop: 3 },
  obsText: { fontSize: 7.5 },

  // Sección 3 — tabla de productos de Bodegaje (puede haber varios)
  sec3TableHeaderRow: { flexDirection: "row", borderBottom: "0.75 solid #000", paddingBottom: 2, marginTop: 4, marginBottom: 2 },
  sec3TableHeaderCell: { fontSize: 6, fontFamily: "Helvetica-Bold", paddingRight: 4 },
  sec3TableRow: { flexDirection: "row", borderBottom: "0.5 solid #999", paddingVertical: 2 },
  sec3TableCell: { fontSize: 6.5, paddingRight: 4 },
  sec3TableCellNum: { fontSize: 6.5, textAlign: "right", paddingRight: 4 },

  // Signatures
  sigRow: { flexDirection: "row", marginTop: 4 },
  sigCol: { flex: 1, borderTop: "0.5 solid #000", paddingTop: 3, marginRight: 8 },
  sigLabel: { fontSize: 7 },
  sigLine: { borderBottom: "0.5 solid #000", marginTop: 8 },

  // Stamp — sello oficial de DESPACHADO: doble borde tipo timbre, logo ADP,
  // RUT de la empresa (no el nombre del despachador) y fecha de despacho.
  stamp: {
    position: "absolute", bottom: 24, right: 24, width: 150,
    border: "1.5 solid #b91c3c", borderRadius: 3, padding: 6,
    transform: "rotate(-6deg)", alignItems: "center",
    backgroundColor: "#fffbfb",
  },
  stampInner: {
    position: "absolute", top: 3, left: 3, right: 3, bottom: 3,
    border: "0.5 solid #b91c3c", borderRadius: 2,
  },
  stampLogo: { width: 72, height: 30, objectFit: "contain", marginBottom: 4 },
  stampText: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: "#b91c3c", letterSpacing: 2.5 },
  stampDivider: { borderBottom: "0.5 solid #b91c3c", width: 56, marginVertical: 4 },
  stampSub: { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#b91c3c", letterSpacing: 0.3 },

  // Firma del conductor (imagen capturada en el canvas)
  firmaImg: { height: 45, maxWidth: 160, objectFit: "contain", marginTop: 2 },
  firmaSello: { fontSize: 5.5, color: "#555", marginTop: 2 },
  firmaLegal: { fontSize: 5.5, color: "#777", marginTop: 4 },
})

function CB({ checked }: { checked: boolean }) {
  return (
    <View style={s.cb}>
      {checked && <View style={s.cbFill} />}
    </View>
  )
}

function Field({ label, value, long, med, short }: { label: string; value?: string | null; long?: boolean; med?: boolean; short?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginRight: 6 }}>
      <Text style={s.fLabel}>{label}</Text>
      <Text style={[s.fVal, long ? s.fValLong : med ? s.fValMed : short ? s.fValShort : {}]}>{value ?? ""}</Text>
    </View>
  )
}

function CbItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.cbRow}>
      <CB checked={checked} />
      <Text style={s.cbLabel}>{label}</Text>
    </View>
  )
}

function fechaFirma(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// Un bloque de firma: nombre, imagen (o línea en blanco) y el sello de la
// firma electrónica — quién, cuándo y el código de verificación del contenido.
function BloqueFirma({ titulo, nombre, firma }: { titulo: string; nombre: string; firma?: FirmaPdf }) {
  return (
    <View style={{ flex: 1, marginRight: 14 }}>
      <Text style={[s.cbLabel, { marginBottom: 4 }]}>{titulo}</Text>
      <Text style={[s.sigLabel, { fontFamily: "Helvetica-Bold", marginBottom: 4 }]}>{nombre}</Text>
      <Text style={[s.cbLabel, { marginTop: 4, marginBottom: 4 }]}>Firma:</Text>
      {firma?.url
        ? <Image style={s.firmaImg} src={firma.url} />
        : <View style={s.sigLine} />
      }
      {firma?.at ? (
        <Text style={s.firmaSello}>
          Firmado electrónicamente por {firma.nombre} · {fechaFirma(firma.at)} · Cód. {firma.codigo}
        </Text>
      ) : null}
    </View>
  )
}

// Columnas de la tabla de productos de Bodegaje — flex ratios pensados para
// el ancho de contenido de una A4 con padding 22 (~551pt).
const SEC3_COLS: { key: keyof ReportBodegajeItem; label: string; flex: number; num?: boolean }[] = [
  { key: "sec3_producto",          label: "Producto",  flex: 2.2 },
  { key: "sec3_clase_imo",         label: "Cl. IMO",   flex: 0.6 },
  { key: "sec3_nu",                label: "NU",         flex: 0.6 },
  { key: "sec3_numero_bodega",     label: "Bodega",     flex: 0.6 },
  { key: "sec3_numero_pallets",    label: "Pallets",    flex: 0.5, num: true },
  { key: "sec3_numero_unidades",   label: "Unid.",      flex: 0.5, num: true },
  { key: "sec3_lote",              label: "Lote",       flex: 0.8 },
  { key: "sec3_cas",               label: "CAS",        flex: 0.6 },
  { key: "sec3_orden_compra",      label: "OC",         flex: 0.7 },
  { key: "sec3_fecha_elaboracion", label: "Elab.",      flex: 0.7 },
  { key: "sec3_fecha_vencimiento", label: "Venc.",      flex: 0.7 },
]

// Tabla compacta de productos de Bodegaje — un report puede tener varios,
// cada uno en su fila. Cabe cómodo en A4 para el rango realista de 1-5
// productos por report.
function TablaBodegaje({ items }: { items: ReportBodegajeItem[] }) {
  return (
    <View>
      <View style={s.sec3TableHeaderRow}>
        {SEC3_COLS.map(col => (
          <Text key={col.key} style={[s.sec3TableHeaderCell, { flex: col.flex, textAlign: col.num ? "right" : "left" }]}>
            {col.label}
          </Text>
        ))}
      </View>
      {items.length === 0 ? (
        <View style={s.sec3TableRow}>
          {SEC3_COLS.map(col => (
            <Text key={col.key} style={[col.num ? s.sec3TableCellNum : s.sec3TableCell, { flex: col.flex }]}>—</Text>
          ))}
        </View>
      ) : (
        items.map(item => (
          <View key={item.id} style={s.sec3TableRow}>
            {SEC3_COLS.map(col => (
              <Text key={col.key} style={[col.num ? s.sec3TableCellNum : s.sec3TableCell, { flex: col.flex }]}>
                {item[col.key] ?? ""}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  )
}

export function ReportPDF({ report, firmas = {}, items = [] }: { report: Report; firmas?: FirmasPdf; items?: ReportBodegajeItem[] }) {
  const isDespachado = report.estado === "despachado"
  const totalPallets  = items.reduce((sum, it) => sum + (it.sec3_numero_pallets  ?? 0), 0)
  const totalUnidades = items.reduce((sum, it) => sum + (it.sec3_numero_unidades ?? 0), 0)

  return (
    // El título "report-{numero}" queda en los metadatos del PDF (lo usa el
    // botón "Descargar" propio del modal — ver download-report-pdf.tsx — y
    // algunos visores como nombre de pestaña), pero el botón de descarga del
    // visor nativo embebido en el iframe no lo respeta: para un blob: URL cae
    // al UUID del blob sin importar el título interno. Ese caso se resuelve
    // sirviendo el PDF desde una ruta del servidor con Content-Disposition
    // (ver /api/reports/[id]/pdf), no acá.
    <Document title={`report-${report.numero}`}>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Image style={s.headerLogo} src={ADP_LOGO_DATA_URI} />
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>REPORT SERVICIO ALMACENAMIENTO</Text>
            <View style={s.headerNumRow}>
              <Text style={s.headerNumLabel}>N°</Text>
              <Text style={s.headerNum}>{report.numero}</Text>
            </View>
          </View>
        </View>

        {/* ── Antecedentes ── */}
        <View style={s.ante}>
          <Text style={s.anteTitle}>Antecedentes:</Text>
          <View style={s.row}>
            <Field label="Cliente:" value={report.cliente} long />
            <Field label="Fecha:" value={report.fecha} short />
          </View>
          <View style={s.row}>
            <Field label="Patente:" value={report.patente} short />
            <Field label="Conductor:" value={report.conductor} med />
            <Field label="R.U.T.:" value={report.rut_conductor} med />
          </View>
          <View style={s.row}>
            <Field label="Nombre de Empresa Transporte:" value={report.empresa_transporte} long />
            <View style={s.cbRow}>
              <CB checked={report.hds_header} />
              <Text style={s.cbLabel}>HDS.</Text>
            </View>
            <Text style={[s.cbLabel, { marginRight: 4 }]}>Tipo de movimiento:</Text>
            <CbItem checked={report.sec3_tipo === "ingreso"}  label="Ingreso" />
            <CbItem checked={report.sec3_tipo === "despacho"} label="Despacho" />
          </View>
          <View style={s.row}>
            <Field label="N° Guía:" value={report.sec3_numero_guia} med />
            <Text style={[s.cbLabel, { marginRight: 4 }]}>Solicitado por:</Text>
            <CbItem checked={report.sec3_solicitado_por === "clientes"}    label="Clientes" />
            <CbItem checked={report.sec3_solicitado_por === "operaciones"} label="Operaciones" />
            <CbItem checked={report.sec3_cuyd} label="CUyD" />
            {report.sec3_cuyd && report.sec3_cuyd_detalle && (
              <Text style={[s.cbLabel, { marginLeft: 2 }]}>({report.sec3_cuyd_detalle})</Text>
            )}
          </View>
        </View>

        {/* ── Sección 1: Depósito Contenedores ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>1.  Deposito Contenedores</Text>

          {!report.sec1_activa ? (
            <Text style={s.secNA}>N/A — no aplica</Text>
          ) : (
          <>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <CbItem checked={report.sec1_tipo_movimiento === "ingreso"} label="1.1  Ingreso" />
              <CbItem checked={report.sec1_tipo_movimiento === "despacho"} label="       Despacho" />
            </View>
            <View style={{ flex: 1.5 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <Text style={[s.cbLabel, { marginRight: 4 }]}>1.2  Contenedor</Text>
                <CbItem checked={report.sec1_tipo_contenedor === "20ft"} label="20'" />
                <CbItem checked={report.sec1_tipo_contenedor === "40ft"} label="40'" />
              </View>
              <CbItem checked={report.sec1_tipo_contenedor === "isotanque"} label="       Isotanque" />
            </View>
          </View>

          <View style={[s.row, { marginTop: 3 }]}>
            <View style={{ flex: 1 }}>
              <CbItem checked={report.sec1_carga_normal} label="1.3  Carga Normal" />
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <CbItem checked={report.sec1_carga_imo} label="       Carga IMO" />
                {report.sec1_carga_imo && (
                  <>
                    <Field label="IMO" value={report.sec1_clase_imo} short />
                    <Field label="NU" value={report.sec1_nu} short />
                  </>
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cbLabel}>1.4  Horas</Text>
              <Field label="I:" value={report.sec1_hora_inicio} med />
              <Field label="T:" value={report.sec1_hora_termino} med />
            </View>
          </View>

          <View style={[s.row, { marginTop: 3 }]}>
            <View style={{ flex: 1.2 }}>
              <Field label="1.5  Sigla:" value={report.sec1_sigla} med />
              <Field label="       Guía N°:" value={report.sec1_guia_numero} med />
            </View>
            <View style={s.cbRow}>
              <CB checked={report.sec1_hds} />
              <Text style={s.cbLabel}>HDS.</Text>
            </View>
          </View>

          <View style={[s.row, { marginTop: 3 }]}>
            <Field label="1.6  Interchange N°:" value={report.sec1_interchange} long />
          </View>
          </>
          )}
        </View>

        {/* ── Sección 2: Consolidado ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>2.  Consolidado - Desconsolidado - Otros</Text>

          {!report.sec2_activa ? (
            <Text style={s.secNA}>N/A — no aplica</Text>
          ) : (
          <>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <CbItem checked={report.sec2_consolidado}    label="2.1  Consolidado" />
              <CbItem checked={report.sec2_desconsolidado} label="       Desconsolidado" />
              <CbItem checked={report.sec2_picking}        label="       Picking" />
            </View>
            <View style={{ flex: 1.2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <CbItem checked={report.sec2_paletizado} label="2.2  Paletizado" />
                <View style={{ marginLeft: 8 }}>
                  <Field label="Horas  I:" value={report.sec2_hora_inicio} short />
                  <Field label="              T:" value={report.sec2_hora_termino} short />
                </View>
              </View>
              <CbItem checked={report.sec2_etiquetado} label="2.3  Etiquetado" />
              <CbItem checked={report.sec2_otro}       label="2.4  Otro" />
            </View>
          </View>

          <View style={[s.row, { marginTop: 3 }]}>
            <Field label="Sigla N°:" value={report.sec2_sigla_numero} long />
          </View>

          <View style={s.obsBox}>
            <Text style={[s.cbLabel, { marginBottom: 2 }]}>Obs:</Text>
            <Text style={s.obsText}>{report.sec2_observaciones ?? ""}</Text>
          </View>
          </>
          )}
        </View>

        {/* ── Sección 3: Bodegaje ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>3.  Bodegaje</Text>

          {!report.sec3_activa ? (
            <Text style={s.secNA}>N/A — no aplica</Text>
          ) : (
          <>
          <View style={s.row}>
            <Field label="H. Inicio:" value={report.sec3_hora_inicio} short />
            <Field label="H. Termino:" value={report.sec3_hora_termino} short />
          </View>

          <View style={[s.row, { marginTop: 2 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
              <CbItem checked={report.sec3_tipo === "ingreso"} label="3.1  Ingreso" />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
              <CbItem checked={report.sec3_tipo === "despacho"} label="3.2  Despacho" />
            </View>
            <Field label="Total Pallets" value={String(totalPallets)} short />
            <Field label="Total Unidades" value={String(totalUnidades)} short />
          </View>

          <TablaBodegaje items={items} />

          <View style={s.obsBox}>
            <Text style={[s.cbLabel, { marginBottom: 2 }]}>Obs:</Text>
            <Text style={s.obsText}>{report.sec3_observaciones ?? ""}</Text>
          </View>
          </>
          )}
        </View>

        {/* ── Firmas ── */}
        {/* Conductor (firma en pantalla), Recepción y encargado de bodega
            (firma guardada en su perfil). Cada una con su sello electrónico. */}
        <View style={s.sigRow}>
          <BloqueFirma titulo="Chofer:" nombre={report.conductor ?? ""} firma={firmas.conductor} />
          <BloqueFirma titulo="Recepción:" nombre={firmas.recepcion?.nombre ?? ""} firma={firmas.recepcion} />
          <BloqueFirma titulo="Encargado de bodega:" nombre={report.nombre_operador ?? firmas.bodega?.nombre ?? ""} firma={firmas.bodega} />
        </View>
        {(firmas.conductor?.at || firmas.recepcion?.at || firmas.bodega?.at) && (
          <Text style={s.firmaLegal}>
            Firmas electrónicas simples (Ley N° 19.799). El código de verificación corresponde a la huella SHA-256 del contenido firmado.
          </Text>
        )}

        {/* ── Sello DESPACHADO ── */}
        {isDespachado && (
          <View style={s.stamp}>
            <View style={s.stampInner} />
            <Image style={s.stampLogo} src={ADP_LOGO_DATA_URI} />
            <Text style={s.stampText}>DESPACHADO</Text>
            <View style={s.stampDivider} />
            <Text style={s.stampSub}>RUT 76.499.190-7</Text>
            {report.fecha_despacho && (
              <Text style={s.stampSub}>
                {new Date(report.fecha_despacho).toLocaleDateString("es-CL")}
              </Text>
            )}
          </View>
        )}

      </Page>
    </Document>
  )
}
