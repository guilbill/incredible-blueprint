// PreToolUse hook (Bash): blocks `git commit` while the typecheck or the unit tests fail.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

let command = ''
try {
  command = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? ''
} catch {
  process.exit(0)
}
if (!/\bgit\s+(-C\s+\S+\s+)?commit\b/.test(command) || /--dry-run/.test(command)) process.exit(0)

try {
  execFileSync('npm', ['run', 'check', '--silent'], { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), stdio: 'pipe', encoding: 'utf8' })
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n')
  process.stderr.write(`Commit blocked: \`npm run check\` fails. Fix it, then commit again.\n\n${out}\n`)
  process.exit(2)
}
