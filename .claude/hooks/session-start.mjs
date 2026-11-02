// SessionStart hook: parallel sessions each start from main in their own worktree and cannot see
// each other's unmerged work. Tell the agent where this checkout stands before it builds anything
// (AGENTS.md, "How we work" 9).
import { execFileSync } from 'node:child_process'
import { devPort } from '../../scripts/dev-port.mjs'

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 15_000 }).trim()

try {
  git('fetch', '--quiet', 'origin', 'main')
} catch {
  // Offline: compare with the last fetched origin/main.
}

const lines = []
try {
  const branch = git('branch', '--show-current') || '(detached HEAD)'
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/main'))
  lines.push(`This checkout: ${dir}, branch ${branch}.`)
  if (behind > 0) {
    lines.push(`It is ${behind} commit(s) behind origin/main: update it before showing anything to the user, or they will think work was lost.`)
  }
  if (/^(claude|copilot)\//.test(branch)) {
    lines.push(`The branch has an agent prefix: rename it to type/slug before the first commit.`)
  }

  // Local branches with commits that main does not have yet (rebased copies do not count).
  const worktrees = new Map()
  for (const block of git('worktree', 'list', '--porcelain').split('\n\n')) {
    const path = block.match(/^worktree (.+)$/m)?.[1]
    const ref = block.match(/^branch refs\/heads\/(.+)$/m)?.[1]
    if (path && ref) worktrees.set(ref, path)
  }
  const pending = []
  for (const name of git('for-each-ref', 'refs/heads', '--format=%(refname:short)').split('\n')) {
    if (!name || name === branch || name === 'main') continue
    const ahead = git('cherry', 'origin/main', name).split('\n').filter((l) => l.startsWith('+')).length
    if (ahead === 0) continue
    const subject = git('log', '-1', '--format=%s', name)
    const where = worktrees.get(name) ? ` (worktree ${worktrees.get(name)})` : ''
    pending.push(`  - ${name}: ${ahead} commit(s) not in main, last "${subject}"${where}`)
  }
  if (pending.length > 0) {
    lines.push(
      'Unmerged local branches (other sessions, possibly unfinished). This checkout does not contain their work; ' +
        'if the user expects to see it, say so and ask before merging anything:',
      ...pending,
    )
  }
} catch {
  // Not a git checkout or git failed: say nothing rather than something wrong.
}

const port = devPort(dir)
lines.push(
  `Dev server and lab for this checkout: http://localhost:${port}/ and http://localhost:${port}/lab.html?topic=<topic>.` +
    (port === 5173
      ? ''
      : ` Start it with \`nohup npm run dev > /tmp/tib-dev-${port}.log 2>&1 &\` (it outlives the turn), then open the URL with preview_start.`),
)

process.stdout.write(lines.join('\n') + '\n')
