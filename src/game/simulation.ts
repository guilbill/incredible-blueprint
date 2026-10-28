import type { Body } from 'planck'
import { data } from '../engine/bodies'
import { hashWorld } from '../engine/hash'
import type { Rope } from '../engine/joints'
import { World, type ContactEvent } from '../engine/world'
import type { Goal, Level, Link, Placement, SimEventName, Solution } from '../level/types'
import { meshGears } from '../parts/mech/gear'
import { buildLink } from '../parts/mech/links'
import { partDef } from '../parts/registry'
import type { PartInstance, SimCtx } from '../parts/types'
import { evaluateGoals } from './goals'

export interface SimEvent { name: SimEventName; part: string; step: number }

const GLOW_DECAY = 0.02

/**
 * One run of a level plus the player's solution. Everything is rebuilt from the inputs, nothing is
 * carried over between runs, and the Level and Solution are only read.
 */
const cmp = (a: number | string, b: number | string): number => (a < b ? -1 : a > b ? 1 : 0)

const settingsKey = (s: Record<string, number>): string =>
  JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k]]))

/**
 * Placements in a canonical order (kind, x, y, rot, flip, settings, then id as a last resort), so
 * the order a player placed parts in never changes the run: same layout, same result.
 */
export function canonicalPlacements(ps: readonly Placement[]): Placement[] {
  return [...ps].sort((a, b) =>
    cmp(a.kind, b.kind) || cmp(a.x, b.x) || cmp(a.y, b.y) || cmp(a.rot, b.rot) ||
    cmp(Number(a.flip), Number(b.flip)) || cmp(settingsKey(a.settings), settingsKey(b.settings)) || cmp(a.id, b.id))
}

/** Links in a canonical order: kind, then each end by the canonical rank of its part and its anchor key. */
export function canonicalLinks(ls: readonly Link[], rank: ReadonlyMap<string, number>): Link[] {
  const r = (id: string): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  return [...ls].sort((a, b) =>
    cmp(a.kind, b.kind) || cmp(r(a.a.part), r(b.a.part)) || cmp(a.a.anchor, b.a.anchor) ||
    cmp(r(a.b.part), r(b.b.part)) || cmp(a.b.anchor, b.b.anchor) || cmp(a.id, b.id))
}

export class Simulation {
  readonly world = new World()
  readonly parts: PartInstance[] = []
  readonly events: SimEvent[] = []
  readonly ropes: Rope[] = []
  /** Rope of each built rope link, by link id (the renderer hides cut ones). */
  readonly ropeOf = new Map<string, Rope>()
  /** Contact events of the last step. Read-only observation for sound; nothing in the simulation reads it. */
  lastContacts: readonly ContactEvent[] = []
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
    const ordered = [...canonicalPlacements(level.fixed), ...canonicalPlacements(sol.placements)]
    for (const p of ordered) {
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
    const rank = new Map(ordered.map((p, i) => [p.id, i]))
    this.buildLinks([...canonicalLinks(level.fixedLinks, rank), ...canonicalLinks(sol.links, rank)])
  }

  /** After all parts exist: meshes touching gears, then builds ropes and belts in link order (invalid links are skipped). */
  protected buildLinks(links: Level['fixedLinks']): void {
    meshGears(this.ctx)
    for (const l of links) {
      if (!buildLink(l, this.ctx) || l.kind !== 'rope') continue
      this.ropeOf.set(l.id, this.ropes[this.ropes.length - 1])
    }
  }

  step(): void {
    for (const p of this.parts) p.onStep?.(this.ctx)
    const contacts = this.world.step()
    this.lastContacts = contacts
    for (const ev of contacts) {
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
