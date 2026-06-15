import puppeteer from 'puppeteer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'screenshots')
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:4400'
const EMAIL    = 'david.silva.p@gmail.com'
const PASSWORD = '123456789'

const snap = async (page, name, selector = null) => {
  if (selector) await page.waitForSelector(selector, { timeout: 8000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 800))
  const path = resolve(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log(`✓ ${name}.png`)
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 860 })

// ── Login ──────────────────────────────────────────────────────────────────
console.log('→ Login...')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
await snap(page, '00_login')

await page.type('#email',    EMAIL,    { delay: 40 })
await page.type('#password', PASSWORD, { delay: 40 })
await page.click('button[type="submit"]')

// Esperar redirección post-login
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 })
  .catch(() => {})
await new Promise(r => setTimeout(r, 1500))

// ── Dashboard ──────────────────────────────────────────────────────────────
console.log('→ Dashboard...')
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await snap(page, '01_dashboard', 'main')

// ── Clientes ───────────────────────────────────────────────────────────────
console.log('→ Clientes...')
await page.goto(`${BASE}/clientes`, { waitUntil: 'networkidle0' })
await snap(page, '02_clientes', 'table, [class*="table"], ul, [class*="card"]')

// ── Inventario ─────────────────────────────────────────────────────────────
console.log('→ Inventario...')
await page.goto(`${BASE}/inventario`, { waitUntil: 'networkidle0' })
// Clic en Brenntag Chile SpA para mostrar sus ítems
await page.evaluate(() => {
  const all = [...document.querySelectorAll('button, li, div[class]')]
  const found = all.find(e => e.textContent?.trim().startsWith('Brenntag Chile SpA'))
  if (found) found.click()
})
await new Promise(r => setTimeout(r, 2000))
await snap(page, '03_inventario')

// ── Movimientos ────────────────────────────────────────────────────────────
console.log('→ Movimientos...')
await page.goto(`${BASE}/movimientos`, { waitUntil: 'networkidle0' })
await snap(page, '04_movimientos', 'table, [class*="table"], [class*="card"]')

// ── Reports / HIS ──────────────────────────────────────────────────────────
console.log('→ Reports...')
await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle0' })
await snap(page, '05_reports', 'table, [class*="table"], [class*="card"]')

// ── Un reporte despachado abierto ──────────────────────────────────────────
// Busca el primer link de un reporte despachado y lo abre
const reportLink = await page.$('a[href*="/reports/"]')
if (reportLink) {
  console.log('→ Detalle de reporte...')
  await reportLink.click()
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 8000 }).catch(() => {})
  await snap(page, '06_report_detalle', 'form, [class*="report"], main')
}

await browser.close()
console.log(`\nScreenshots guardados en: ${OUT}`)
