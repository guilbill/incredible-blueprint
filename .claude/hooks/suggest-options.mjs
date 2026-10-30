// UserPromptSubmit hook: when the user's message is about something they will see, hear or handle,
// remind the agent to show variants in the lab before coding (AGENTS.md, "How we work" 1).
import { readFileSync } from 'node:fs'

let prompt = ''
try {
  prompt = JSON.parse(readFileSync(0, 'utf8')).prompt ?? ''
} catch {
  process.exit(0)
}

const CUES = [
  /\bic[oô]ne?s?\b/i, /\bicons?\b/i, /\bvisuel/i, /\bvisual/i, /\bdesign\b/i, /\bcouleurs?\b/i, /\bcolou?rs?\b/i,
  /\bsons?\b/i, /\bsounds?\b/i, /\bbruit/i, /\bdessin/i, /\breprésent/i, /\blook\b/i, /\bstyle\b/i,
  /\bplus (discret|petit|gros|grand|fin|lisible|visible)/i, /\btrop (gros|grand|petit|visible)/i,
  /\bbouton/i, /\bbutton/i, /\bpanneau/i, /\bbarre\b/i, /\bmenu\b/i, /\btooltip/i, /\binfobulle/i,
  /\bergonomi/i, /\bintuiti/i, /\bglisser\b/i, /\bdrag\b/i, /\bpoignée/i, /\bhandle/i, /\banimation/i,
  /\bpropos(e|ition)s?\b/i, /\bonglet\b/i, /\bmaquette/i, /\bmockup/i,
]

if (CUES.some((re) => re.test(prompt))) {
  process.stdout.write(
    'Project rule (AGENTS.md, How we work 1): this request touches something the user will see, hear or handle. ' +
      'Unless the user already picked an option, use the propose-options skill: build 3 or 4 variants in src/lab/topics/, ' +
      'open http://localhost:5173/lab.html?topic=<topic> in the browser pane, and code only the chosen one. ' +
      'Name the place on screen; ask if it is unclear.\n',
  )
}
