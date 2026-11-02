// Each checkout gets its own dev server port, so parallel sessions never open each other's lab.
// The main checkout keeps 5173; a worktree in .claude/worktrees/<name> gets a port from 5200 to 5299 picked from its name.
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export function devPort(dir) {
  if (basename(dirname(dir)) !== 'worktrees') return 5173
  let hash = 0
  for (const c of basename(dir)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return 5200 + (hash % 100)
}

// `node scripts/dev-port.mjs` prints the port of the current checkout.
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(devPort(process.cwd()))
