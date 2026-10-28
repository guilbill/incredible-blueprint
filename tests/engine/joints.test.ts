import { describe, expect, it } from 'vitest'
import { World, toUV } from '../../src/engine/world'
import { dynamicCircle, compound } from '../../src/engine/bodies'
import { gear, motor, pin, rope } from '../../src/engine/joints'
import { len, sub, v } from '../../src/engine/vec'

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) w.step()
}

describe('joints', () => {
  it('rope of length 100 holds a hanging ball; after cut() it falls', () => {
    const w = new World()
    const ball = dynamicCircle(w, v(60, 50), 10, { bullet: true })
    const r = rope(w, w.ground, v(0, 0), ball, v(0, 0), 100)
    expect(r.enabled).toBe(true)
    run(w, 3)
    const p = toUV(ball.getPosition())
    expect(len(p)).toBeLessThan(102)
    expect(p.y).toBeGreaterThan(80)
    const [a, b] = r.segment()
    expect(len(sub(a, v(0, 0)))).toBeLessThan(1e-9)
    expect(len(sub(b, p))).toBeLessThan(1e-9)

    r.cut()
    expect(r.enabled).toBe(false)
    expect(w.pl.getJointList()).toBeNull()
    r.cut() // idempotent
    run(w, 1)
    expect(toUV(ball.getPosition()).y).toBeGreaterThan(p.y + 300)
  })

  it('two pinned gears with gear ratio -2: motor A at 2 rad/s gives B about -4 rad/s', () => {
    const w = new World()
    const a = dynamicCircle(w, v(0, 0), 40, {})
    const b = compound(w, v(100, 0), [{ kind: 'circle', r: 20 }], {})
    const ja = pin(w, a, v(0, 0))
    const jb = pin(w, b, v(100, 0))
    gear(w, ja, jb, -2)
    motor(ja, 2, 1e6)
    run(w, 1)
    expect(a.getAngularVelocity()).toBeCloseTo(2, 2)
    expect(b.getAngularVelocity()).toBeCloseTo(-4, 2)
    // pins keep the gears in place under gravity
    expect(len(sub(toUV(a.getPosition()), v(0, 0)))).toBeLessThan(0.5)
    expect(len(sub(toUV(b.getPosition()), v(100, 0)))).toBeLessThan(0.5)

    ja.enableMotor(false)
    expect(ja.isMotorEnabled()).toBe(false)
  })
})
