import { expect, test, type Page } from '@playwright/test'

type Pt = { x: number; y: number }

/** Real touch input through the DevTools protocol: the browser applies touch-action and may cancel the pointer. */
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: string, at?: Pt) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: at ? [{ x: at.x, y: at.y }] : [] })
  return {
    async drag(from: Pt, to: Pt): Promise<void> {
      await send('touchStart', from)
      for (let i = 1; i <= 10; i++) {
        await send('touchMove', { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 })
        await page.waitForTimeout(16)
      }
      await send('touchEnd')
    },
    async hold(at: Pt, ms: number): Promise<void> {
      await send('touchStart', at)
      await page.waitForTimeout(ms)
      await send('touchEnd')
    },
    async tap(at: Pt): Promise<void> {
      await send('touchStart', at)
      await send('touchEnd')
    },
  }
}

async function center(page: Page, selector: string): Promise<Pt> {
  const box = (await page.locator(selector).first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('a finger places, moves and selects parts, and a long press opens the menu', async ({ page }) => {
  // straight to the levels, past the welcome machine
  await page.addInitScript(() => localStorage.setItem('tim.welcomed', 'true'))
  await page.goto('/')
  await page.locator('.level-fig').first().click()
  const canvas = page.locator('.stage canvas')
  const board = (await canvas.boundingBox())!
  const at = (fx: number, fy: number): Pt => ({ x: board.x + board.width * fx, y: board.y + board.height * fy })
  const t = await touch(page)

  // drawer to board
  const count = page.locator('.inventory .item .count').first()
  const before = await count.textContent()
  await t.drag(await center(page, '.inventory .item'), at(0.3, 0.3))
  await expect(count).not.toHaveText(before!)

  // board to board: the page must not scroll the drag away
  await t.drag(at(0.3, 0.3), at(0.6, 0.4))
  await t.tap(at(0.05, 0.05))
  await expect(page.locator('.selpanel')).toBeHidden()
  await t.tap(at(0.3, 0.3))
  await expect(page.locator('.selpanel')).toBeHidden()
  await t.tap(at(0.6, 0.4))
  await expect(page.locator('.selpanel')).toBeVisible()
  await expect(page.locator('.selpanel .toggle')).toBeVisible()

  // long press on empty space: the board menu
  await t.hold(at(0.05, 0.05), 700)
  await expect(page.locator('.ctxmenu')).toBeVisible()
  await expect(page.locator('.ctxmenu .item')).toHaveCount(2)
})
