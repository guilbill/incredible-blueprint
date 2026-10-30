// Runs after `vite build`: the published site holds the game and its editor only. Fails if any dev tool
// (the design lab, its topics) made it into dist/, so it can never reach GitHub Pages.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const FORBIDDEN = [/^lab\.html$/, /(^|\/)lab[-./]/i, /src\/lab\//, /defineLab/, /lab\.choice\./]

const files = []
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(p)
  }
}
walk(DIST)

const leaks = files.flatMap((p) => {
  const rel = p.slice(DIST.length)
  if (FORBIDDEN.slice(0, 2).some((re) => re.test(rel))) return [rel]
  if (!/\.(js|html|webmanifest)$/.test(rel)) return []
  const text = readFileSync(p, 'utf8')
  return FORBIDDEN.slice(2).some((re) => re.test(text)) ? [`${rel} (lab code inside)`] : []
})

if (leaks.length) {
  console.error(`dist/ contains dev-only lab files, refusing to publish:\n  ${leaks.join('\n  ')}`)
  process.exit(1)
}
console.log(`dist/ checked: ${files.length} files, no lab.`)
