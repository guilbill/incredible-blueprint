import { World } from '../../src/engine/world'
import { compound, dynamicBox, dynamicCircle, staticBox } from '../../src/engine/bodies'
import { gear, motor, pin, rope } from '../../src/engine/joints'
import { hashWorld } from '../../src/engine/hash'
import { v } from '../../src/engine/vec'

interface Scenario {
  world: World
  /** Called before each step with the step index (0-based). */
  onStep?: (i: number) => void
}

/** Balls rolling down tilted ramps and bouncing on a floor. */
function cascade(): Scenario {
  const w = new World()
  staticBox(w, v(150, 80), v(220, 10), 0.3, { friction: 0.4, restitution: 0.3 })
  staticBox(w, v(300, 200), v(220, 10), -0.3, { friction: 0.4, restitution: 0.3 })
  staticBox(w, v(200, 380), v(500, 20), 0, { friction: 0.5, restitution: 0.5 })
  staticBox(w, v(-10, 250), v(20, 400), 0, {})
  staticBox(w, v(410, 250), v(20, 400), 0, {})
  for (let i = 0; i < 6; i++) {
    dynamicCircle(w, v(60 + i * 17, 20 - i * 25), 8 + (i % 3) * 2, { restitution: 0.55, friction: 0.3, density: 1 + i * 0.1 })
  }
  dynamicBox(w, v(120, 10), v(16, 12), 0.2, { restitution: 0.2 })
  return { world: w }
}

/** A motor drives a three gear train with a ball resting on the last wheel. */
function gears(): Scenario {
  const w = new World()
  const a = compound(w, v(100, 150), [{ kind: 'circle', r: 30 }, { kind: 'box', wh: v(70, 6) }], {})
  const b = compound(w, v(170, 150), [{ kind: 'circle', r: 20 }, { kind: 'box', wh: v(6, 50) }], {})
  const c = compound(w, v(220, 150), [{ kind: 'circle', r: 15 }, { kind: 'box', wh: v(40, 6) }], {})
  const ja = pin(w, a, v(100, 150))
  const jb = pin(w, b, v(170, 150))
  const jc = pin(w, c, v(220, 150))
  gear(w, ja, jb, -1.5)
  gear(w, jb, jc, -4 / 3)
  motor(ja, 3, 1e6)
  staticBox(w, v(160, 260), v(300, 20), 0, { restitution: 0.3 })
  dynamicCircle(w, v(212, 100), 7, { restitution: 0.4 })
  dynamicCircle(w, v(95, 100), 6, { restitution: 0.4 })
  return { world: w }
}

/** A ball swings on a rope, which is cut at step 300, then falls onto a floor. */
function pendulum(): Scenario {
  const w = new World()
  const ball = dynamicCircle(w, v(40, 60), 10, { restitution: 0.4 })
  const weight = dynamicBox(w, v(180, 60), v(14, 14), 0, {})
  const r = rope(w, w.ground, v(100, 0), ball, v(0, 0), 90)
  rope(w, ball, v(0, 0), weight, v(0, 0), 150)
  staticBox(w, v(100, 330), v(400, 20), 0, { restitution: 0.4 })
  return {
    world: w,
    onStep: (i) => {
      if (i === 300) r.cut()
    },
  }
}

const builders: Record<string, () => Scenario> = { cascade, gears, pendulum }

export const scenarioNames = Object.keys(builders)

export function runScenario(name: string, steps: number): string {
  const build = builders[name]
  if (!build) throw new Error(`unknown scenario ${name}`)
  const { world, onStep } = build()
  for (let i = 0; i < steps; i++) {
    onStep?.(i)
    world.step()
  }
  return hashWorld(world)
}

export function runAll(steps: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of scenarioNames) out[n] = runScenario(n, steps)
  return out
}
