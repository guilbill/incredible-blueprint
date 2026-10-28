import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listTs(p) : p.endsWith('.ts') ? [p] : []
  })
}

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length

/** Static value imports and dynamic imports/requires of planck (type-only imports are fine). */
const VALUE_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+['"]planck['"]|import\(\s*['"]planck['"]\s*\)|require\(\s*['"]planck['"]\s*\)/gm

describe('planck imports', () => {
  it('only src/engine imports planck values, always after import "./dmath"', () => {
    const hits: string[] = []
    for (const file of listTs('src')) {
      const src = readFileSync(file, 'utf8')
      const inEngine = file.startsWith(join('src', 'engine') + '/')
      for (const m of src.matchAll(VALUE_IMPORT)) {
        const where = `${file}:${lineOf(src, m.index)}`
        if (!inEngine) {
          hits.push(`${where}: planck values may only be imported from src/engine`)
          continue
        }
        const first = /^import\s.*$/m.exec(src)?.[0].trim()
        if (first !== "import './dmath'" && first !== 'import "./dmath"') {
          hits.push(`${where}: first import of the file must be import './dmath' (Planck captures Math.sin/cos/atan2 when it loads)`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
