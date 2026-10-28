import type { Body } from 'planck'
import { dynamicCircle, staticBox } from '../../engine/bodies'
import { motor, pin } from '../../engine/joints'
import { v } from '../../engine/vec'
import type { World } from '../../engine/world'
import type { Placement } from '../../level/types'
import { CELL, DENSITY, instance, pos } from '../common'
import type { PartInstance } from '../types'

/**
 * Mouse motor torque T in kg·units²/s² (8 N·m in Planck): lifts an empty bucket (0.34 kg, needs
 * ~3.9 N·m on a 20-unit lever) but stalls on one holding a bowling ball (1.5 kg, ~17 N·m). The
 * monkey gets 3T (24 N·m).
 */
export const MOTOR_TORQUE = 8 * 1600
/** Minimum contact impulse (kg·units/s) on the frame that starts the motor. */
export const KICK = 30
/** Drive wheel radius (units); belts use it for their ratio. */
export const WHEEL_R = CELL

interface DriveSpec {
  /** Frame size in units. */
  w: number
  h: number
  /** rad/s, clockwise on screen (flip reverses it). */
  speed: number
  torque: number
  tag: string
}

/**
 * A static solid frame with a sensor wheel pinned at its centre (belt anchor). `state.running`
 * turns on with a hit of impulse > KICK on the frame, or at once when `startNow`; the motor then
 * drives the wheel for good.
 */
export function buildDrive(world: World, p: Placement, spec: DriveSpec, startNow: boolean): PartInstance {
  const frame: Body = staticBox(world, pos(p), v(spec.w, spec.h), 0, {
    friction: 0.5,
    restitution: 0.1,
    data: { part: p.id, tags: [spec.tag] },
  })
  // A sensor, so it can sit inside the solid frame; it only turns and carries the belt.
  const wheel = dynamicCircle(world, pos(p), WHEEL_R, {
    density: DENSITY,
    sensor: true,
    bullet: false,
    data: { part: p.id, tags: [`${spec.tag}-wheel`] },
  })
  const j = pin(world, wheel, pos(p))
  const inst = instance(p, [frame, wheel], { belt: { body: wheel, local: v(0, 0), radius: WHEEL_R, pin: j } })
  const start = () => {
    inst.state.running = 1
    motor(j, p.flip ? -spec.speed : spec.speed, spec.torque)
  }
  inst.state.running = 0
  if (startNow) start()
  inst.onStep = (sim) => {
    if (inst.state.running) sim.activate(inst)
  }
  inst.onContact = (ev, self, _other, sim) => {
    if (self !== frame || ev.began || ev.impulse <= KICK || inst.state.running) return
    start()
    sim.activate(inst)
  }
  return inst
}
