import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import type { Report } from "@/types/database"

const BLUE = "#1a3a5c"

const s = StyleSheet.create({
  page: { padding: 22, fontFamily: "Helvetica", fontSize: 8, color: "#000" },

  // Header
  header: { flexDirection: "row", alignItems: "center", borderBottom: "1.5 solid #000", paddingBottom: 6, marginBottom: 8 },
  logoBox: { width: 90, height: 36, border: "1 solid #999", alignItems: "center", justifyContent: "center", borderRadius: 3 },
  logoName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BLUE },
  logoSub: { fontSize: 5, color: "#555", marginTop: 1, textAlign: "center" },
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

  // Checkbox row
  cbRow: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 },
  cb: { width: 9, height: 9, border: "1 solid #000", marginRight: 3, alignItems: "center", justifyContent: "center" },
  cbCheck: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: -1 },
  cbLabel: { fontSize: 7.5 },

  // Obs box
  obsBox: { border: "0.5 solid #000", minHeight: 28, padding: 3, marginTop: 3 },
  obsText: { fontSize: 7.5 },

  // Signatures
  sigRow: { flexDirection: "row", marginTop: 4 },
  sigCol: { flex: 1, borderTop: "0.5 solid #000", paddingTop: 3, marginRight: 8 },
  sigLabel: { fontSize: 7 },
  sigLine: { borderBottom: "0.5 solid #000", marginTop: 8 },

  // Stamp
  stamp: {
    position: "absolute", bottom: 22, right: 22,
    border: "2 solid #e53e3e", padding: "6 10", transform: "rotate(-15deg)",
    alignItems: "center",
  },
  stampText: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#e53e3e", letterSpacing: 2 },
  stampSub: { fontSize: 7, color: "#e53e3e" },
})

function CB({ checked }: { checked: boolean }) {
  return (
    <View style={s.cb}>
      {checked && <Text style={s.cbCheck}>✓</Text>}
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

export function ReportPDF({ report }: { report: Report }) {
  const isDespachado = report.estado === "despachado"

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoName}>INCOMEX</Text>
            <Text style={s.logoSub}>UNA EMPRESA{"\n"}ALTOS DEL PUERTO</Text>
          </View>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>REPORT SERVICIO ALMACENAMIENTO</Text>
            <View style={s.headerNumRow}>
              <Text style={s.headerNumLabel}>N°</Text>
              <Text style={s.headerNum}>{report.numero}</Text>
            </View>
          </View>
          <View style={s.logoBox}>
            <Text style={s.logoName}>MAR AZUL</Text>
            <Text style={s.logoSub}>UNA EMPRESA{"\n"}ALTOS DEL PUERTO</Text>
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
          </View>
        </View>

        {/* ── Sección 1: Depósito Contenedores ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>1.  Deposito Contenedores</Text>

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
        </View>

        {/* ── Sección 2: Consolidado ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>2.  Consolidado - Desconsolidado - Otros</Text>

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
        </View>

        {/* ── Sección 3: Bodegaje ── */}
        <View style={s.secBox}>
          <Text style={s.secTitle}>3.  Bodegaje</Text>

          <View style={s.row}>
            <Field label="Producto:" value={report.sec3_producto} med />
            <Field label="Clase IMO:" value={report.sec3_clase_imo} short />
            <Field label="H. Inicio:" value={report.sec3_hora_inicio} short />
          </View>
          <View style={[s.row, { marginTop: 2 }]}>
            <Field label="N° de Bodega:" value={report.sec3_numero_bodega} short />
            <Field label="NU:" value={report.sec3_nu} short />
            <Field label="H. Termino:" value={report.sec3_hora_termino} short />
          </View>

          <View style={[s.row, { marginTop: 4 }]}>
            {/* Left col: movement + pallets */}
            <View style={{ flex: 1.2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <CbItem checked={report.sec3_tipo === "ingreso"} label="3.1  Ingreso" />
                <Field label="N° de Pallets" value={report.sec3_tipo === "ingreso" ? String(report.sec3_numero_pallets ?? "") : ""} short />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <CbItem checked={report.sec3_tipo === "despacho"} label="3.2  Despacho" />
                <Field label="N° de Pallets" value={report.sec3_tipo === "despacho" ? String(report.sec3_numero_pallets ?? "") : ""} short />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                <Field label="N° de Guía" value={report.sec3_numero_guia} med />
              </View>
            </View>

            {/* Right col: obs */}
            <View style={[s.obsBox, { flex: 1, marginTop: 0 }]}>
              <Text style={[s.cbLabel, { marginBottom: 2 }]}>Obs:</Text>
              <Text style={s.obsText}>{report.sec3_observaciones ?? ""}</Text>
            </View>
          </View>

          {/* Solicitado por */}
          <View style={[s.row, { marginTop: 5 }]}>
            <Text style={[s.cbLabel, { marginRight: 6 }]}>3.3  Mov. Interno solicitado por:</Text>
          </View>
          <View style={[s.row, { marginLeft: 10 }]}>
            <CbItem checked={report.sec3_solicitado_por === "clientes"} label="Clientes" />
            <CbItem checked={report.sec3_solicitado_por === "hds"}      label="HDS." />
            <CbItem checked={report.sec3_solicitado_por === "operaciones"} label="Operaciones" />
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={s.cbLabel}>CUyD </Text>
              <Text style={[s.fVal, s.fValShort]}>{report.sec3_cuyd_detalle ?? ""}</Text>
            </View>
          </View>
        </View>

        {/* ── Firmas ── */}
        <View style={s.sigRow}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <Text style={[s.cbLabel, { marginBottom: 4 }]}>Nombre:</Text>
            <View style={s.sigLine} />
            <Text style={[s.cbLabel, { marginTop: 8, marginBottom: 4 }]}>Firma:</Text>
            <View style={s.sigLine} />
            <Text style={[s.sigLabel, { marginTop: 2 }]}>{report.nombre_operador ?? ""}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.cbLabel, { marginBottom: 4 }]}>Nombre:</Text>
            <View style={s.sigLine} />
            <Text style={[s.cbLabel, { marginTop: 8, marginBottom: 4 }]}>Firma:</Text>
            <View style={s.sigLine} />
            {isDespachado && (
              <Text style={[s.sigLabel, { marginTop: 2 }]}>{report.nombre_despachador ?? ""}</Text>
            )}
          </View>
        </View>

        {/* ── Sello DESPACHADO ── */}
        {isDespachado && (
          <View style={s.stamp}>
            <Text style={s.stampText}>DESPACHADO</Text>
            {report.nombre_despachador && (
              <Text style={s.stampSub}>Nombre: {report.nombre_despachador}</Text>
            )}
            {report.fecha_despacho && (
              <Text style={s.stampSub}>
                Fecha: {new Date(report.fecha_despacho).toLocaleDateString("es-CL")}
              </Text>
            )}
          </View>
        )}

      </Page>
    </Document>
  )
}
