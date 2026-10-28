import { describe, expect, it } from 'vitest'
import { World, toU, toUV, toMV, MAX_SPEED, MAX_ANG } from '../../src/engine/world'
import { dynamicBox, dynamicCircle, staticBox } from '../../src/engine/bodies'
import { hashWorld } from '../../src/engine/hash'
import { v } from '../../src/engine/vec'
import type { Body } from 'planck'

const pos = (b: Body) => toUV(b.getPosition())
const vel = (b: Body) => toUV(b.getLinearVelocity())
const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) w.step()
}

describe('World', () => {
  it('free fall for 1 s is about half g t squared', () => {
    const w = new World()
    const ball = dynamicCircle(w, v(0, 0), 10, { bullet: true })
    run(w, 1)
    const y = pos(ball).y
    expect(y).toBeGreaterThan(440)
    expect(y).toBeLessThan(460)
  })

  it('ball dropped on floor comes to rest', () => {
    const w = new World()
    staticBox(w, v(0, 200), v(400, 20), 0, {})
    const ball = dynamicCircle(w, v(0, 0), 10, { bullet: true })
    run(w, 4)
    expect(Math.abs(vel(ball).y)).toBeLessThan(1)
    expect(pos(ball).y).toBeGreaterThan(170)
    expect(pos(ball).y).toBeLessThan(195)
  })

  it('restitution 0.8 bounce reaches 50 to 70 % of the drop height', () => {
    const w = new World()
    // floor top surface at y = 190, ball bottom starts at y = -10: drop of 200
    staticBox(w, v(0, 200), v(400, 20), 0, {})
    const ball = dynamicCircle(w, v(0, -20), 10, { bullet: true, restitution: 0.8 })
    let bounced = false
    let apex = Infinity
    for (let i = 0; i < 240; i++) {
      w.step()
      const vy = vel(ball).y
      if (!bounced && vy < 0) bounced = true
      if (bounced) apex = Math.min(apex, pos(ball).y)
    }
    expect(bounced).toBe(true)
    const rise = 180 - apex // resting centre is y = 180
    expect(rise / 200).toBeGreaterThan(0.5)
    expect(rise / 200).toBeLessThan(0.7)
  })

  it('ball rolls down a 30 degree ramp and gains speed', () => {
    const w = new World()
    // angle +30 deg with y down: the ramp descends to the right
    staticBox(w, v(0, 0), v(400, 20), Math.PI / 6, { friction: 0.6 })
    const ball = dynamicCircle(w, v(-100, -100), 10, { bullet: true, friction: 0.6 })
    run(w, 0.5)
    const s1 = Math.hypot(vel(ball).x, vel(ball).y)
    const x1 = pos(ball).x
    run(w, 0.5)
    const s2 = Math.hypot(vel(ball).x, vel(ball).y)
    expect(s1).toBeGreaterThan(0)
    expect(s2).toBeGreaterThan(s1 + 50)
    expect(pos(ball).x).toBeGreaterThan(x1)
    expect(vel(ball).x).toBeGreaterThan(0)
  })

  it('ball at 1000 units/s does not pass a 10-unit wall', () => {
    const w = new World()
    staticBox(w, v(300, 0), v(10, 400), 0, {})
    const ball = dynamicCircle(w, v(0, 0), 5, { bullet: true })
    ball.setLinearVelocity(toMV(v(1000, 0)))
    let maxX = -Infinity
    for (let i = 0; i < 120; i++) {
      w.step()
      maxX = Math.max(maxX, pos(ball).x)
    }
    expect(maxX).toBeLessThan(295)
  })

  it('speed is clamped to MAX_SPEED', () => {
    const w = new World()
    w.pl.setGravity({ x: 0, y: 0 })
    const ball = dynamicCircle(w, v(0, 0), 10, { bullet: true })
    ball.setLinearVelocity(toMV(v(3000, 4000)))
    ball.setAngularVelocity(500)
    w.step()
    const s = Math.hypot(vel(ball).x, vel(ball).y)
    expect(s).toBeLessThanOrEqual(MAX_SPEED + 1e-6)
    expect(s).toBeGreaterThan(MAX_SPEED - 1)
    expect(Math.abs(ball.getAngularVelocity())).toBeLessThanOrEqual(MAX_ANG + 1e-9)
  })

  it('conveyor with surfaceSpeed 100 carries a box to the right', () => {
    const w = new World()
    staticBox(w, v(0, 100), v(800, 20), 0, { friction: 0.8, data: { surfaceSpeed: 100 } })
    const box = dynamicBox(w, v(0, 79), v(20, 20), 0, { friction: 0.8 })
    run(w, 2)
    expect(pos(box).x).toBeGreaterThan(100)
    expect(vel(box).x).toBeGreaterThan(90)
    expect(vel(box).x).toBeLessThan(110)
  })

  it('reports contacts with impulses in units', () => {
    const w = new World()
    const floor = staticBox(w, v(0, 200), v(400, 20), 0, {})
    const ball = dynamicCircle(w, v(0, 0), 10, { bullet: true })
    let began = false
    let maxImpulse = 0
    for (let i = 0; i < 120; i++) {
      for (const e of w.step()) {
        const pair = [e.a, e.b]
        expect(pair).toContain(floor)
        expect(pair).toContain(ball)
        if (e.began) began = true
        maxImpulse = Math.max(maxImpulse, e.impulse)
      }
    }
    expect(began).toBe(true)
    // impact speed is about sqrt(2 * 900 * 180) = 569 units/s, impulse about m * v
    const m = ball.getMass()
    expect(maxImpulse).toBeGreaterThan(m * 400)
    expect(maxImpulse).toBeLessThan(m * 1200)
  })

  it('bodies() returns creation order', () => {
    const w = new World()
    const a = dynamicCircle(w, v(0, 0), 10, {})
    const b = staticBox(w, v(0, 100), v(40, 20), 0, {})
    const c = dynamicBox(w, v(50, 0), v(20, 20), 0, {})
    expect(w.bodies()).toEqual([w.ground, a, b, c])
    w.pl.destroyBody(b)
    expect(w.bodies()).toEqual([w.ground, a, c])
  })

  it('same setup built twice, 600 steps: same hash', () => {
    const build = () => {
      const w = new World()
      staticBox(w, v(0, 300), v(800, 20), 0.1, {})
      for (let i = 0; i < 8; i++) {
        dynamicCircle(w, v(-200 + i * 45, -i * 30), 10, { bullet: true, restitution: 0.5 })
        dynamicBox(w, v(-180 + i * 45, -100 - i * 25), v(20, 20), i * 0.2, {})
      }
      return w
    }
    const w1 = build()
    const w2 = build()
    expect(hashWorld(w1)).toBe(hashWorld(w2))
    for (let i = 0; i < 600; i++) {
      w1.step()
      w2.step()
    }
    const h = hashWorld(w1)
    expect(h).toMatch(/^[0-9a-f]{8}$/)
    expect(h).toBe(hashWorld(w2))
    w1.step()
    expect(hashWorld(w1)).not.toBe(h)
  })

  it('unit conversion round-trips', () => {
    expect(toU(1)).toBe(40)
    expect(toUV(toMV(v(20, -40)))).toEqual(v(20, -40))
  })
})
