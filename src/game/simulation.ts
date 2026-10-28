import type { Body } from 'planck'
import { data } from '../engine/bodies'
import { hashWorld } from '../engine/hash'
import type { Rope } from '../engine/joints'
import { World } from '../engine/world'
import type { Goal, Level, SimEventName, Solution } from '../level/types'
import { partDef } from '../parts/registry'
import type { PartInstance, SimCtx } from '../parts/types'
import { evaluateGoals } from './goals'

export interface SimEvent { name: SimEventName; part: string; step: number }

const GLOW_DECAY = 0.02

/**
 * One run of a level plus the player's solution. Everything is rebuilt from the inputs, nothing is
 * carried over between runs, and the Level and Solution are only read.
 */
export class Simulation {
  readonly world = new World()
  readonly parts: PartInstance[] = []
  readonly events: SimEvent[] = []
  readonly ropes: Rope[] = []
  stepIndex = 0
  goalsMet = false
  private readonly goals: Goal[]
  private readonly holds: number[]
  private readonly byId = new Map<string, PartInstance>()
  private readonly byBody = new Map<Body, PartInstance>()
  private readonly ctx: SimCtx

  constructor(level: Level, sol: Solution) {
    this.goals = level.goals
    this.holds = level.goals.map(() => 0)
    const buildCtx = { world: this.world, ground: this.world.ground }
    for (const p of [...level.fixed, ...sol.placements]) {
      const inst = partDef(p.kind).build(buildCtx, p)
      this.parts.push(inst)
      this.byId.set(inst.id, inst)
      for (const b of inst.bodies) this.byBody.set(b, inst)
    }
    const sim = this
    this.ctx = {
      world: this.world,
      get step() { return sim.stepIndex },
      parts: this.parts,
      ropes: this.ropes,
      part: (id) => this.byId.get(id),
      emit: (name, part) => { this.events.push({ name, part, step: this.stepIndex }) },
      activate: (part) => { part.glow = 1 },
    }
    this.buildLinks([...level.fixedLinks, ...sol.links])
  }

  /** Hook for Task 8: build ropes and belts from links, after all parts exist. Links are ignored until then. */
  protected buildLinks(_links: Level['fixedLinks']): void {}

  step(): void {
    for (const p of this.parts) p.onStep?.(this.ctx)
    for (const ev of this.world.step()) {
      const pa = this.owner(ev.a)
      const pb = this.owner(ev.b)
      pa?.onContact?.(ev, ev.a, ev.b, this.ctx)
      if (pb && pb !== pa) pb.onContact?.(ev, ev.b, ev.a, this.ctx)
    }
    for (const p of this.parts) p.glow = Math.max(0, p.glow - GLOW_DECAY)
    this.stepIndex++
    this.goalsMet = evaluateGoals(this.goals, this, this.holds)
  }

  private owner(b: Body): PartInstance | undefined {
    const id = data(b).part
    return id === null ? undefined : this.byId.get(id)
  }
}

export function runUntilGoal(level: Level, sol: Solution, maxSteps = 120 * 60): { met: boolean; step: number; hash: string } {
  const sim = new Simulation(level, sol)
  while (!sim.goalsMet && sim.stepIndex < maxSteps) sim.step()
  return { met: sim.goalsMet, step: sim.stepIndex, hash: hashWorld(sim.world) }
}
