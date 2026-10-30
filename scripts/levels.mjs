// Prints the shipped levels as a table: idea and difficulty (from the solution's `notes`), parts, duration.
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../levels/', import.meta.url)
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
const files = readdirSync(dir).filter((f) => /^\d\d-.+\.json$/.test(f) && !f.endsWith('.solution.json') && !f.startsWith('00-')).sort()

const rows = files.map((f) => {
  const level = read(f)
  let ref
  try {
    ref = read(f.replace(/\.json$/, '.solution.json'))
  } catch {
    ref = undefined
  }
  const used = ref?.solution.placements ?? []
  const stock = level.inventory.reduce((n, it) => n + it.count, 0)
  return {
    level: level.id.slice(0, 2),
    title: level.title,
    diff: ref?.notes?.difficulty ?? '—',
    parts: String(used.length),
    decoys: String(stock - used.length),
    fixed: String(level.fixed.length),
    time: ref ? `${(ref.step / 120).toFixed(1)} s` : '—',
    kinds: [...new Set(used.map((p) => p.kind))].join(', '),
    idea: ref?.notes?.idea ?? '',
  }
})

const cols = ['level', 'title', 'diff', 'parts', 'decoys', 'fixed', 'time', 'kinds']
const width = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))]))
const line = (r) => cols.map((c) => String(r[c]).padEnd(width[c])).join('  ')
console.log(line(Object.fromEntries(cols.map((c) => [c, c]))))
for (const r of rows) {
  console.log(line(r))
  if (r.idea) console.log(`${' '.repeat(width.level + 2)}↳ ${r.idea}`)
}
