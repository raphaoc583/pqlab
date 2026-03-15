// Screenshot capture script for pqLAB
// Usage: node scripts/screenshots.mjs

import { chromium } from 'playwright'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'screenshots')
const BASE = 'http://localhost:5173'

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // ── 0. Login page (logged out) ─────────────────────────────────────────
  await page.goto(`${BASE}/#/login`)
  await page.waitForLoadState('networkidle')
  // clear any leftover session
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(OUT, '00-login.png'), fullPage: true })
  console.log('✓ 00-login.png')

  // ── Enter demo mode ────────────────────────────────────────────────────
  // Click "Modo demonstração" button
  await page.getByRole('button', { name: /modo demonstra/i }).click()
  await page.waitForURL(/diario/)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)

  // ── 1. Diário de Campo ─────────────────────────────────────────────────
  await page.screenshot({ path: join(OUT, '01-diario.png'), fullPage: true })
  console.log('✓ 01-diario.png')

  // ── 2. Listas e Memorandos ─────────────────────────────────────────────
  await page.goto(`${BASE}/#/listas`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '02-listas.png'), fullPage: true })
  console.log('✓ 02-listas.png')

  // ── 3. Tarefas ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/tarefas`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '03-tarefas.png'), fullPage: true })
  console.log('✓ 03-tarefas.png')

  // ── 4. Favoritos ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/bookmarks`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '04-bookmarks.png'), fullPage: true })
  console.log('✓ 04-bookmarks.png')

  // ── 5. Fichamentos ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/fichamentos`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '05-fichamentos.png'), fullPage: true })
  console.log('✓ 05-fichamentos.png')

  // ── 6. Planos ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/planos`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '06-planos.png'), fullPage: true })
  console.log('✓ 06-planos.png')

  // ── 7. Visualização em Mapa ────────────────────────────────────────────
  // Visit listas + diario first to populate wiki link registry
  await page.goto(`${BASE}/#/diario`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  await page.goto(`${BASE}/#/listas`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  await page.goto(`${BASE}/#/mapa`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500) // let physics settle
  await page.screenshot({ path: join(OUT, '07-mapa.png'), fullPage: true })
  console.log('✓ 07-mapa.png')

  await browser.close()
  console.log('\nAll screenshots saved to screenshots/')
}

main().catch((e) => { console.error(e); process.exit(1) })
