import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/engine', 'src/parts', 'src/game', 'src/level']
const FORBIDDEN = /Math\.random|\bDate\b|performance\.now|Math\.(hypot|pow|tan|exp|log)\b/

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listTs(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('determinism', () => {
  it('forbids Math.random, Date and performance.now in simulation code', () => {
    const hits: string[] = []
    for (const file of ROOTS.flatMap(listTs)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`)
        })
    }
    expect(hits).toEqual([])
  })
})
