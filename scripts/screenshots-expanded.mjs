// Screenshot capture script — expanded views for pqLAB
// Usage: node scripts/screenshots-expanded.mjs

import { chromium } from 'playwright'
import { mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'screenshots')
const BASE = 'http://localhost:5173'

async function enterDemo(page) {
  await page.goto(`${BASE}/#/login`)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /modo demonstra/i }).click()
  await page.waitForURL(/diario/)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  await enterDemo(page)

  // ── 01-exp: Diário de Campo — expand first entry ───────────────────────
  await page.goto(`${BASE}/#/diario`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  // Click the chevron/expand button on the first entry card
  const diarioCards = page.locator('[class*="rounded-xl"]').filter({ hasText: 'Visita ao arquivo' })
  const expandBtn = diarioCards.first().getByRole('button').last()
  await expandBtn.click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, '01-diario-exp.png'), fullPage: true })
  console.log('✓ 01-diario-exp.png')

  // ── 02-exp: Listas e Memorandos — open editor ─────────────────────────
  await page.goto(`${BASE}/#/listas`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  // Click the list card to open editor
  await page.getByText('Leituras do semestre').first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '02-listas-exp.png'), fullPage: true })
  console.log('✓ 02-listas-exp.png')

  // ── 03-exp: Tarefas — open task list editor ───────────────────────────
  await page.goto(`${BASE}/#/tarefas`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  // Default view is 'list'. Click the task list title row to open editor.
  await page.getByText('Tarefas de março').first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '03-tarefas-exp.png'), fullPage: true })
  console.log('✓ 03-tarefas-exp.png')

  // ── 04-exp: Favoritos — open edit form for first bookmark ────────────
  await page.goto(`${BASE}/#/bookmarks`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  // Default view is 'cards'. Click the Edit2 button on the first bookmark card.
  const firstBmCard = page.locator('[class*="rounded-xl"]').filter({ hasText: 'SciELO' }).first()
  await firstBmCard.getByRole('button').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, '04-bookmarks-exp.png'), fullPage: true })
  console.log('✓ 04-bookmarks-exp.png')

  // ── 05-exp: Fichamentos — expand first fichamento ─────────────────────
  await page.goto(`${BASE}/#/fichamentos`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  // Click the chevron button (last button) on the first fichamento card
  const ficCard = page.locator('[class*="rounded-xl"]').filter({ hasText: 'A Imaginação Sociológica' }).first()
  await ficCard.getByRole('button').last().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, '05-fichamentos-exp.png'), fullPage: true })
  console.log('✓ 05-fichamentos-exp.png')

  // ── 06-exp: Planos — expand first plano ───────────────────────────────
  await page.goto(`${BASE}/#/planos`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
  // Click the chevron button (last button) on the plano card
  const planoCard = page.locator('[class*="rounded-xl"]').filter({ hasText: 'Introdução à Sociologia' }).first()
  await planoCard.getByRole('button').last().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, '06-planos-exp.png'), fullPage: true })
  console.log('✓ 06-planos-exp.png')

  // ── 07-exp: Mapa — navigate modules first, then capture ───────────────
  await page.goto(`${BASE}/#/diario`)
  await page.waitForLoadState('networkidle')
  await page.goto(`${BASE}/#/listas`)
  await page.waitForLoadState('networkidle')
  await page.goto(`${BASE}/#/fichamentos`)
  await page.waitForLoadState('networkidle')
  await page.goto(`${BASE}/#/mapa`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(OUT, '07-mapa-exp.png'), fullPage: true })
  console.log('✓ 07-mapa-exp.png')

  await browser.close()
  console.log('\nAll expanded screenshots saved to screenshots/')
}

main().catch((e) => { console.error(e); process.exit(1) })
