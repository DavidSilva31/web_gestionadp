import puppeteer from 'puppeteer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', '..', 'Web_ADPLanding', 'adp-landing', 'screenshots')
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:4200'

const snap = async (page, name) => {
  await new Promise(r => setTimeout(r, 1200))
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false })
  console.log(`✓ ${name}.png`)
}

const waitForServer = async (retries = 25) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(BASE)
      if (res.ok || res.status < 500) return
    } catch {}
    await new Promise(r => setTimeout(r, 1500))
    process.stdout.write('.')
  }
  throw new Error('Servidor no disponible en ' + BASE)
}

console.log('Esperando servidor en puerto 4300...')
await waitForServer()
console.log('\nServidor listo.')

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 860 })

const pages = [
  { name: '01_inicio',          path: '/inicio'          },
  { name: '02_nosotros',        path: '/nosotros'        },
  { name: '03_servicios',       path: '/servicios'       },
  { name: '04_infraestructura', path: '/infraestructura' },
  { name: '05_contacto',        path: '/contacto'        },
]

for (const p of pages) {
  console.log(`→ ${p.name}...`)
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle0', timeout: 20000 })
  await snap(page, p.name)
}

await browser.close()
console.log(`\nScreenshots guardados en: ${OUT}`)
