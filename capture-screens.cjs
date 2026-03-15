const { chromium } = require('playwright')
const path = require('path')

const BASE = 'http://localhost:5173'
const OUT  = path.join(__dirname, 'screenshots')

const PAGES = [
  { route: '/diario',      file: '01-diario-de-campo.png',    label: 'Diário de Campo' },
  { route: '/bookmarks',   file: '02-bookmarks.png',          label: 'Bookmarks' },
  { route: '/fichamentos', file: '03-fichamentos.png',         label: 'Fichamentos' },
  { route: '/planos',      file: '04-planos.png',             label: 'Planos' },
  { route: '/listas',      file: '05-listas.png',             label: 'Listas' },
  { route: '/tarefas',     file: '06-tarefas.png',            label: 'Tarefas' },
]

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page    = await ctx.newPage()

  for (const { route, file, label } of PAGES) {
    console.log(`→ ${label}`)
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, file), fullPage: false })

    // For Fichamentos: also open one fichamento detail
    if (route === '/fichamentos') {
      const card = page.locator('button[title="Exportar PDF"]').first()
      if (await card.count()) {
        const expand = page.locator('button[title="Expandir"]').first()
        if (await expand.count()) {
          await expand.click()
          await page.waitForTimeout(600)
          await page.screenshot({ path: path.join(OUT, '03b-fichamento-detalhe.png'), fullPage: false })
          await page.locator('button[title="Expandir"]').first().click().catch(() => {})
        }
      }
    }

    // For Bookmarks: also show RSS tab
    if (route === '/bookmarks') {
      const rssTab = page.locator('[role="tab"]:last-of-type')
      if (await rssTab.count()) {
        await rssTab.click()
        await page.waitForTimeout(10000) // wait for RSS fetch
        await page.screenshot({ path: path.join(OUT, '02b-bookmarks-rss.png'), fullPage: false })
      }
    }

    // For Planos: also open the editor
    if (route === '/planos') {
      const editBtn = page.locator('button[title="Editar"]').first()
      if (await editBtn.count()) {
        await editBtn.click()
        await page.waitForTimeout(800)
        await page.screenshot({ path: path.join(OUT, '04b-planos-editor.png'), fullPage: false })
        await page.goBack()
      }
    }
  }

  await browser.close()
  console.log('✓ Done')
})()
