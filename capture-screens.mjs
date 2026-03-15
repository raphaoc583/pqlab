import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5173'
const OUT  = join(__dirname, 'screenshots')

const MODULES = [
  { route: '/diario',      file: '01-diario-de-campo.png' },
  { route: '/bookmarks',   file: '02-bookmarks.png' },
  { route: '/fichamentos', file: '03-fichamentos.png' },
  { route: '/planos',      file: '04-planos.png' },
  { route: '/listas',      file: '05-listas.png' },
  { route: '/tarefas',     file: '06-tarefas.png' },
]

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page    = await ctx.newPage()

  // ── Login page screenshot ─────────────────────────────────────────
  console.log('→ 00-login.png')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/00-login.png` })

  // ── Activate demo mode ────────────────────────────────────────────
  console.log('→ Activating demo mode...')
  const demoBtn = page.locator('text=Modo demonstração')
  await demoBtn.waitFor({ timeout: 8000 })
  await demoBtn.click()
  await page.waitForURL(`${BASE}/diario`, { timeout: 8000 })
  await page.waitForTimeout(1200)
  console.log('  Demo mode active ✓')

  // ── Module screenshots ────────────────────────────────────────────
  for (const { route, file } of MODULES) {
    console.log(`→ ${file}`)
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 12000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OUT}/${file}` })
  }

  // ── Bookmarks RSS tab ─────────────────────────────────────────────
  console.log('→ 02b-bookmarks-rss.png')
  await page.goto(`${BASE}/bookmarks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const rssTab = page.locator('[role="tab"]:last-of-type')
  await rssTab.click()
  await page.waitForTimeout(11000) // wait for RSS fetch via codetabs
  await page.screenshot({ path: `${OUT}/02b-bookmarks-rss.png` })

  // ── Planos editor ─────────────────────────────────────────────────
  console.log('→ 04b-planos-editor.png')
  await page.goto(`${BASE}/planos`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const editBtn = page.locator('button[title="Editar"]').first()
  if (await editBtn.count()) {
    await editBtn.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/04b-planos-editor.png` })
  }

  await browser.close()
  console.log('\n✓ All screenshots saved to', OUT)
})()
