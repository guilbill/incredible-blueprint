import { runAll } from '../tests/engine/scenarios'

const out = document.querySelector<HTMLPreElement>('#out')
if (out) out.textContent = JSON.stringify(runAll(1200))
