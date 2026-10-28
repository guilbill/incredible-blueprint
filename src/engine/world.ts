import * as planck from 'planck'
import type { Body, Contact, ContactImpulse } from 'planck'
import { type Vec, v } from './vec'

/** Metres per game unit: 1 unit = 0.025 m, so a 20-unit cell is 0.5 m. Only src/engine sees metres. */
export const SCALE = 1 / 40
export const toM = (u: number): number => u * SCALE
export const toU = (m: number): number => m / SCALE
export const toMV = (a: Vec): Vec => v(a.x * SCALE, a.y * SCALE)
export const toUV = (a: Vec): Vec => v(a.x / SCALE, a.y / SCALE)

export const GRAVITY = 900 // units/s², y down
export const MAX_SPEED = 1000 // units/s
export const MAX_ANG = 40 // rad/s

export interface BodyData {
  part: string | null
  tags: string[]
  /** Speed (units/s) at which this body's surface drags what touches it, along the body's local +x axis. */
  surfaceSpeed: number
}

export function data(b: Body): BodyData {
  let d = b.getUserData() as BodyData | null
  if (!d) {
    d = { part: null, tags: [], surfaceSpeed: 0 }
    b.setUserData(d)
  }
  return d
}

export interface ContactEvent {
  a: Body
  b: Body
  /** World normal from a to b. */
  normal: Vec
  /** Total normal impulse in kg·units/s (Planck reports kg·m/s, divided by SCALE). Zero on began events. */
  impulse: number
  began: boolean
}

const worldNormal = (c: Contact): Vec => {
  const n = c.getWorldManifold(null)?.normal
  return n ? v(n.x, n.y) : v(0, 0)
}

export class World {
  readonly DT = 1 / 120
  readonly pl: planck.World
  ground: Body
  private readonly list: Body[] = []
  private events: ContactEvent[] = []

  constructor() {
    this.pl = new planck.World({ gravity: { x: 0, y: toM(GRAVITY) } })
    this.pl.on('add-body', (b) => {
      this.list.push(b)
    })
    this.pl.on('remove-body', (b) => {
      const i = this.list.indexOf(b)
      if (i >= 0) this.list.splice(i, 1)
    })
    this.pl.on('begin-contact', (c) => this.onBegin(c))
    this.pl.on('pre-solve', (c) => this.onPreSolve(c))
    this.pl.on('post-solve', (c, imp) => this.onPostSolve(c, imp))
    this.ground = this.pl.createBody()
  }

  /** Advances one fixed step and returns the contact events it produced, in Planck's callback order. */
  step(): ContactEvent[] {
    this.events = []
    this.pl.step(this.DT, 8, 3)
    const maxV = toM(MAX_SPEED)
    for (const b of this.list) {
      if (!b.isDynamic()) continue
      const lv = b.getLinearVelocity()
      const s = Math.hypot(lv.x, lv.y)
      if (s > maxV) b.setLinearVelocity({ x: (lv.x * maxV) / s, y: (lv.y * maxV) / s })
      const av = b.getAngularVelocity()
      if (Math.abs(av) > MAX_ANG) b.setAngularVelocity(Math.sign(av) * MAX_ANG)
    }
    return this.events
  }

  /** Every body, ground first, in creation order. */
  bodies(): Body[] {
    return this.list.slice()
  }

  private onBegin(c: Contact): void {
    this.events.push({
      a: c.getFixtureA().getBody(),
      b: c.getFixtureB().getBody(),
      normal: worldNormal(c),
      impulse: 0,
      began: true,
    })
  }

  private onPostSolve(c: Contact, imp: ContactImpulse): void {
    const n = c.getManifold().pointCount
    let total = 0
    for (let i = 0; i < n; i++) total += imp.normalImpulses[i]
    this.events.push({
      a: c.getFixtureA().getBody(),
      b: c.getFixtureB().getBody(),
      normal: worldNormal(c),
      impulse: toU(total),
      began: false,
    })
  }

  /** Conveyors: drive the relative tangential speed so the other body moves along the conveyor's +x axis. */
  private onPreSolve(c: Contact): void {
    const bA = c.getFixtureA().getBody()
    const bB = c.getFixtureB().getBody()
    const sA = data(bA).surfaceSpeed
    const sB = data(bB).surfaceSpeed
    // Always set it: Planck keeps the last tangent speed on a live contact, so a stopped conveyor must write 0.
    if (sA === 0 && sB === 0) {
      c.setTangentSpeed(0)
      return
    }
    const n = worldNormal(c)
    // Planck's solver tangent is cross(n, 1) and it targets dot(vB - vA, tangent) = tangentSpeed.
    const t = v(n.y, -n.x)
    let speed = 0
    if (sA !== 0) {
      const ax = bA.getTransform().q
      speed += toM(sA) * (ax.c * t.x + ax.s * t.y)
    }
    if (sB !== 0) {
      const ax = bB.getTransform().q
      speed -= toM(sB) * (ax.c * t.x + ax.s * t.y)
    }
    c.setTangentSpeed(speed)
  }
}
