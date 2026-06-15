import puppeteer from 'puppeteer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath  = resolve(__dirname, 'propuesta_ADP_Gestion.html')
const pdfPath   = resolve(__dirname, 'propuesta_ADP_Gestion.pdf')

const browser = await puppeteer.launch({ headless: true })
const page    = await browser.newPage()

await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })

await page.addStyleTag({ content: `
  /* Ocultar botón de impresión */
  .no-print { display: none !important; }

  /* Evitar cortes dentro de tablas y sus filas */
  .price-table        { page-break-inside: avoid; break-inside: avoid; }
  .price-table tr     { page-break-inside: avoid; break-inside: avoid; }
  .price-table tfoot  { page-break-inside: avoid; break-inside: avoid; }

  /* Evitar cortes en bloques de precio */
  [style*="display:flex"][style*="background:var(--blue-light)"] {
    page-break-inside: avoid; break-inside: avoid;
  }

  /* Portada: eliminar espacio vacío forzando el flex a distribuir mejor */
  .page:first-of-type {
    min-height: 297mm;
    height: 297mm;
  }

  /* Páginas internas: que el footer quede pegado abajo */
  .page {
    height: 297mm;
    min-height: 297mm;
    overflow: hidden;
  }
` })

await page.pdf({
  path:              pdfPath,
  format:            'A4',
  printBackground:   true,
  margin:            { top: 0, right: 0, bottom: 0, left: 0 },
  preferCSSPageSize: true,
})

await browser.close()
console.log(`PDF generado: ${pdfPath}`)
