import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('simulation hashes match the golden file', async ({ page, browserName }) => {
  await page.goto('/determinism.html')
  await expect(page.locator('#out')).not.toBeEmpty()
  const got = JSON.parse((await page.locator('#out').textContent()) ?? '{}')
  console.log(browserName, JSON.stringify(got))
  const golden = JSON.parse(readFileSync(new URL('../tests/engine/golden.json', import.meta.url), 'utf8'))
  expect(got).toEqual(golden)
})

test('every shipped level replays to its stored step and hash', async ({ page, browserName }) => {
  const dir = new URL('../levels/', import.meta.url)
  const expected: Record<string, { met: boolean; step: number; hash: string }> = {}
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.solution.json'))) {
    const { step, hash } = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
    expected[f.replace('.solution.json', '')] = { met: true, step, hash }
  }
  await page.goto('/determinism.html')
  await expect(page.locator('#levels')).not.toBeEmpty()
  const got = JSON.parse((await page.locator('#levels').textContent()) ?? '{}')
  console.log(browserName, JSON.stringify(got))
  expect(Object.keys(expected)).toHaveLength(30)
  expect(got).toEqual(expected)
})
