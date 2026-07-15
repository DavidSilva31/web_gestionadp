import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"

const BLUE    = "#0A4A7F"
const CELESTE = "#29ABE2"
const AMBER   = "#D97706"
const EMERALD = "#059669"
const GREY    = "#64748B"
const ROSE    = "#E11D48"

const AREA_PDF_COLORS: Record<string, string> = {
  "Bodega IMO":      AMBER,
  "Zona Isotanques": CELESTE,
  "Zona RESPEL":     ROSE,
  "Bodega General":  EMERALD,
}

export interface AnaliticaPDFData {
  year: number
  periodo: "mensual" | "anual"
  periodoLabel: string
  kpis: { total: number; entradas: number; salidas: number; clientes: number; entPct: number | null; salPct: number | null }
  mensual: { mes: string; entradas: number; salidas: number }[]
  topItems: { nombre: string; entradas: number; salidas: number; total: number; pct: number }[]
  topClientes: { nombre: string; total: number; pct: number }[]
  areaData?: { area: string; entradas: number; salidas: number; total: number; pct: number }[]
  stockStatus?: { normal: number; bajo: number; critico: number; total: number }
  reportsFunnel?: { borradores: number; pendientes: number; despachados: number; total: number }
}

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 44, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 9, color: "#1A1A1A" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottom: `1.5 solid ${BLUE}`, paddingBottom: 10, marginBottom: 18 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BLUE },
  subtitle: { fontSize: 8.5, color: GREY, marginTop: 2 },
  genDate: { fontSize: 7, color: "#A0AEC0", marginTop: 3 },

  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: BLUE, marginBottom: 8 },
  sectionSub: { fontSize: 7.5, color: GREY, marginTop: -6, marginBottom: 8 },

  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  kpiCard: { flex: 1, padding: 9, borderRadius: 4, backgroundColor: "#F5F9FC", border: "0.5 solid #E2E8F0" },
  kpiValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: BLUE },
  kpiLabel: { fontSize: 7.5, color: "#444", marginTop: 3, fontFamily: "Helvetica-Bold" },
  kpiSub: { fontSize: 6.5, color: "#94A3B8", marginTop: 1 },

  table: { border: "0.5 solid #E2E8F0", borderRadius: 2, marginBottom: 18, overflow: "hidden" },
  tHeadRow: { flexDirection: "row", backgroundColor: BLUE },
  tRow: { flexDirection: "row", borderTop: "0.5 solid #E2E8F0", alignItems: "center" },
  tRowAlt: { backgroundColor: "#F8FAFC" },

  cMes:   { width: "12%", fontSize: 7.5, padding: 6, fontFamily: "Helvetica-Bold", color: "#fff" },
  cNum:   { width: "11%", fontSize: 7.5, padding: 6, textAlign: "right", color: "#fff", fontFamily: "Helvetica-Bold" },
  cBar:   { width: "44%", fontSize: 7.5, padding: 6, color: "#fff", fontFamily: "Helvetica-Bold" },

  cMesV:  { width: "12%", fontSize: 8, padding: 6, fontFamily: "Helvetica-Bold" },
  cNumV:  { width: "11%", fontSize: 8, padding: 6, textAlign: "right" },
  cBarV:  { width: "44%", padding: 6, justifyContent: "center" },

  barTrack:   { height: 6, width: "100%", backgroundColor: "#E2E8F0", borderRadius: 3, flexDirection: "row", overflow: "hidden" },
  barSegEnt:  { height: 6, backgroundColor: EMERALD },
  barSegSal:  { height: 6, backgroundColor: AMBER },
  barSegCli:  { height: 6, backgroundColor: CELESTE, borderRadius: 3 },

  rankRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderTop: "0.5 solid #E2E8F0" },
  rankNum: { width: 18, fontSize: 8, color: "#94A3B8", fontFamily: "Helvetica-Bold" },
  rankName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingRight: 6 },
  rankMeta: { width: 120, alignItems: "flex-end" },
  rankMetaText: { fontSize: 7, color: GREY },
  rankTotal: { width: 28, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },

  legendRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 7.5, color: GREY },

  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#A0AEC0", borderTop: "0.5 solid #E2E8F0", paddingTop: 6 },

  // Página 3
  p3Row: { flexDirection: "row", gap: 18, marginBottom: 22 },
  miniCard: { flex: 1, border: "0.5 solid #E2E8F0", borderRadius: 3, overflow: "hidden" },
  miniCardHeader: { backgroundColor: BLUE, padding: "5 8", flexDirection: "row", alignItems: "center", gap: 4 },
  miniCardTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff" },
  miniItem: { flexDirection: "row", alignItems: "center", padding: "6 8", gap: 6 },
  miniItemBorder: { borderTop: "0.5 solid #E2E8F0" },
  miniDot: { width: 6, height: 6, borderRadius: 1 },
  miniLabel: { flex: 1, fontSize: 7.5 },
  miniBar: { width: 50, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: 4, borderRadius: 2 },
  miniCount: { width: 22, fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  miniFooter: { padding: "4 8", borderTop: "0.5 solid #E2E8F0", backgroundColor: "#F8FAFC" },
  miniFooterText: { fontSize: 6.5, color: GREY, textAlign: "center" },
})

function fmtPctLabel(pct: number | null, periodo: "mensual" | "anual"): string {
  const vsLabel = periodo === "mensual" ? "vs mes anterior" : "vs año anterior"
  if (pct === null) return `s/d ${vsLabel}`
  return `${pct > 0 ? "+" : ""}${pct}% ${vsLabel}`
}

function Header({ periodoLabel }: { periodoLabel: string }) {
  return (
    <View style={s.header} fixed>
      <Image style={s.logo} src={`${window.location.origin}/adp_logo_hd.png`} />
      <View style={s.headerRight}>
        <Text style={s.title}>Informe de Analítica — Almacén</Text>
        <Text style={s.subtitle}>Altos del Puerto · Periodo {periodoLabel}</Text>
        <Text style={s.genDate}>
          Generado el {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
        </Text>
      </View>
    </View>
  )
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Altos del Puerto — Logística Integral · Camino La Pólvora 106, Valparaíso</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

export function AnaliticaPDF({ data }: { data: AnaliticaPDFData }) {
  const { year, periodo, periodoLabel, kpis, mensual, topItems, topClientes } = data
  const maxMensual = Math.max(...mensual.flatMap(m => [m.entradas + m.salidas]), 1)

  const kpiCards = [
    { label: "Total movimientos", value: kpis.total,    sub: periodoLabel },
    { label: "Entradas",          value: kpis.entradas, sub: fmtPctLabel(kpis.entPct, periodo) },
    { label: "Salidas",           value: kpis.salidas,  sub: fmtPctLabel(kpis.salPct, periodo) },
    { label: "Clientes activos",  value: kpis.clientes, sub: "empresas con carga" },
  ]

  const hasPage3 = !!(data.areaData || data.stockStatus || data.reportsFunnel)

  return (
    <Document title={`Analítica ADP — ${periodoLabel}`}>
      {/* ── Página 1: KPIs + movimientos por mes ── */}
      <Page size="A4" style={s.page}>
        <Header periodoLabel={periodoLabel} />

        <View style={s.kpiRow}>
          {kpiCards.map(k => (
            <View key={k.label} style={s.kpiCard}>
              <Text style={s.kpiValue}>{k.value}</Text>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiSub}>{k.sub}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Movimientos por mes</Text>
        <Text style={s.sectionSub}>Entradas vs. salidas registradas — {year}</Text>

        <View style={s.legendRow}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: EMERALD }]} /><Text style={s.legendText}>Entradas</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AMBER }]} /><Text style={s.legendText}>Salidas</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tHeadRow}>
            <Text style={s.cMes}>Mes</Text>
            <Text style={s.cNum}>Entradas</Text>
            <Text style={s.cNum}>Salidas</Text>
            <Text style={s.cBar}>Proporción</Text>
            <Text style={s.cNum}>Total</Text>
          </View>
          {mensual.map((m, i) => {
            const total    = m.entradas + m.salidas
            const widthPct = (total / maxMensual) * 100
            const entShare = total > 0 ? (m.entradas / total) * 100 : 0
            const salShare = total > 0 ? (m.salidas / total) * 100 : 0
            return (
              <View key={m.mes} style={[s.tRow, i % 2 !== 0 ? s.tRowAlt : {}]}>
                <Text style={s.cMesV}>{m.mes}</Text>
                <Text style={[s.cNumV, { color: EMERALD }]}>{m.entradas}</Text>
                <Text style={[s.cNumV, { color: AMBER }]}>{m.salidas}</Text>
                <View style={s.cBarV}>
                  <View style={[s.barTrack, { width: `${Math.max(widthPct, 3)}%` }]}>
                    <View style={[s.barSegEnt, { width: `${entShare}%` }]} />
                    <View style={[s.barSegSal, { width: `${salShare}%` }]} />
                  </View>
                </View>
                <Text style={[s.cNumV, { fontFamily: "Helvetica-Bold" }]}>{total}</Text>
              </View>
            )
          })}
        </View>

        <Footer />
      </Page>

      {/* ── Página 2: Cargas y clientes más activos ── */}
      <Page size="A4" style={s.page}>
        <Header periodoLabel={periodoLabel} />

        <Text style={s.sectionTitle}>Cargas más activas</Text>
        <Text style={s.sectionSub}>Top 5 por cantidad de movimientos — {periodoLabel}</Text>
        <View style={s.legendRow}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: EMERALD }]} /><Text style={s.legendText}>Entradas</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AMBER }]} /><Text style={s.legendText}>Salidas</Text></View>
        </View>

        <View style={{ marginBottom: 22 }}>
          {topItems.length === 0 ? (
            <Text style={{ fontSize: 8, color: GREY }}>Sin movimientos registrados.</Text>
          ) : topItems.map((it, i) => {
            const entShare = it.total > 0 ? (it.entradas / it.total) * 100 : 0
            const salShare = it.total > 0 ? (it.salidas / it.total) * 100 : 0
            return (
              <View key={it.nombre} style={s.rankRow}>
                <Text style={s.rankNum}>#{i + 1}</Text>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.rankName}>{it.nombre}</Text>
                  <View style={[s.barTrack, { width: `${Math.max(it.pct, 4)}%`, marginTop: 3 }]}>
                    <View style={[s.barSegEnt, { width: `${entShare}%` }]} />
                    <View style={[s.barSegSal, { width: `${salShare}%` }]} />
                  </View>
                </View>
                <View style={s.rankMeta}>
                  <Text style={s.rankMetaText}>↓{it.entradas} entradas  ↑{it.salidas} salidas</Text>
                </View>
                <Text style={s.rankTotal}>{it.total}</Text>
              </View>
            )
          })}
        </View>

        <Text style={s.sectionTitle}>Clientes más activos</Text>
        <Text style={s.sectionSub}>Top 5 por cantidad de movimientos — {periodoLabel}</Text>

        <View>
          {topClientes.length === 0 ? (
            <Text style={{ fontSize: 8, color: GREY }}>Sin movimientos registrados.</Text>
          ) : topClientes.map((c, i) => (
            <View key={c.nombre} style={s.rankRow}>
              <Text style={s.rankNum}>#{i + 1}</Text>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.rankName}>{c.nombre}</Text>
                <View style={[s.barTrack, { width: `${Math.max(c.pct, 4)}%`, marginTop: 3 }]}>
                  <View style={[s.barSegCli, { width: "100%" }]} />
                </View>
              </View>
              <Text style={s.rankTotal}>{c.total}</Text>
            </View>
          ))}
        </View>

        <Footer />
      </Page>

      {/* ── Página 3: Área · Stock · Reports ── */}
      {hasPage3 && (
        <Page size="A4" style={s.page}>
          <Header periodoLabel={periodoLabel} />

          {/* Distribución por área */}
          {data.areaData && (
            <>
              <Text style={s.sectionTitle}>Distribución por área</Text>
              <Text style={s.sectionSub}>Movimientos por zona del almacén — {periodoLabel}</Text>
              <View style={s.legendRow}>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: EMERALD }]} /><Text style={s.legendText}>Entradas</Text></View>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AMBER }]} /><Text style={s.legendText}>Salidas</Text></View>
              </View>
              <View style={{ marginBottom: 22 }}>
                {data.areaData.map((a) => {
                  const entShare = a.total > 0 ? (a.entradas / a.total) * 100 : 0
                  const salShare = a.total > 0 ? (a.salidas / a.total) * 100 : 0
                  const color    = AREA_PDF_COLORS[a.area] ?? GREY
                  return (
                    <View key={a.area} style={[s.rankRow, { paddingVertical: 7 }]}>
                      <View style={{ width: 7, height: 7, borderRadius: 1, backgroundColor: color, marginRight: 8, flexShrink: 0 }} />
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[s.rankName, { fontSize: 8 }]}>{a.area}</Text>
                        {a.total > 0 && (
                          <View style={[s.barTrack, { width: `${Math.max(a.pct, 4)}%`, marginTop: 3 }]}>
                            <View style={[s.barSegEnt, { width: `${entShare}%` }]} />
                            <View style={[s.barSegSal, { width: `${salShare}%` }]} />
                          </View>
                        )}
                      </View>
                      <View style={s.rankMeta}>
                        <Text style={s.rankMetaText}>↓{a.entradas} ent.  ↑{a.salidas} sal.</Text>
                      </View>
                      <Text style={s.rankTotal}>{a.total}</Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {/* Stock + Reports — lado a lado */}
          <View style={s.p3Row}>

            {/* Stock al cierre */}
            {data.stockStatus && (
              <View style={s.miniCard}>
                <View style={s.miniCardHeader}>
                  <Text style={s.miniCardTitle}>Stock al cierre del período</Text>
                </View>
                {([
                  { label: "Normal",  value: data.stockStatus.normal,  color: EMERALD },
                  { label: "Bajo",    value: data.stockStatus.bajo,    color: AMBER   },
                  { label: "Crítico", value: data.stockStatus.critico, color: ROSE    },
                ] as const).map(({ label, value, color }, i) => {
                  const pct = data.stockStatus!.total > 0 ? (value / data.stockStatus!.total) * 100 : 0
                  return (
                    <View key={label} style={[s.miniItem, i > 0 ? s.miniItemBorder : {}]}>
                      <View style={[s.miniDot, { backgroundColor: color }]} />
                      <Text style={s.miniLabel}>{label}</Text>
                      <View style={s.miniBar}>
                        <View style={[s.miniBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.miniCount, { color }]}>{value}</Text>
                    </View>
                  )
                })}
                <View style={s.miniFooter}>
                  <Text style={s.miniFooterText}>{data.stockStatus.total} ítems activos en total</Text>
                </View>
              </View>
            )}

            {/* Reports del período */}
            {data.reportsFunnel && (
              <View style={s.miniCard}>
                <View style={s.miniCardHeader}>
                  <Text style={s.miniCardTitle}>Reports del período</Text>
                </View>
                {([
                  { label: "Borradores",  value: data.reportsFunnel.borradores,  color: "#94A3B8" },
                  { label: "Pendientes",  value: data.reportsFunnel.pendientes,  color: AMBER    },
                  { label: "Despachados", value: data.reportsFunnel.despachados, color: EMERALD  },
                ] as const).map(({ label, value, color }, i) => {
                  const pct = data.reportsFunnel!.total > 0 ? (value / data.reportsFunnel!.total) * 100 : 0
                  return (
                    <View key={label} style={[s.miniItem, i > 0 ? s.miniItemBorder : {}]}>
                      <View style={[s.miniDot, { backgroundColor: color }]} />
                      <Text style={s.miniLabel}>{label}</Text>
                      <View style={s.miniBar}>
                        <View style={[s.miniBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={[s.miniCount, { color }]}>{value}</Text>
                    </View>
                  )
                })}
                <View style={s.miniFooter}>
                  <Text style={s.miniFooterText}>{data.reportsFunnel.total} reports en el período</Text>
                </View>
              </View>
            )}

          </View>

          <Footer />
        </Page>
      )}
    </Document>
  )
}
