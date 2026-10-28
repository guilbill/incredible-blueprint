import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('simulation hashes match the golden file', async ({ page, browserName }) => {
  await page.goto('/determinism.html')
  await expect(page.locator('#out')).not.toBeEmpty()
  const got = JSON.parse((await page.locator('#out').textContent()) ?? '{}')
  console.log(browserName, JSON.stringify(got))
  const golden = JSON.parse(readFileSync(new URL('../tests/engine/golden.json', import.meta.url), 'utf8'))
  expect(got).toEqual(golden)
})
