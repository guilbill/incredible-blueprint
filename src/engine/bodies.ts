import './dmath'
import { Box, Circle, Polygon, Vec2 } from 'planck'
import type { Body, BodyType, Shape } from 'planck'
import type { Vec } from './vec'
import { type BodyData, World, data, toM, toMV, toU, toUV } from './world'

export { data, type BodyData }

/** Density and friction are Planck values (kg/m², Coulomb). Geometry is in units. */
export interface BodyOpts {
  density?: number
  friction?: number
  restitution?: number
  sensor?: boolean
  bullet?: boolean
  data?: Partial<BodyData>
}

/** Local shape in units, relative to the body origin. */
export type ShapeSpec =
  | { kind: 'circle'; r: number; offset?: Vec }
  | { kind: 'box'; wh: Vec; offset?: Vec; angle?: number }
  | { kind: 'polygon'; points: Vec[] }

function toShape(s: ShapeSpec): Shape {
  switch (s.kind) {
    case 'circle':
      return new Circle(toMV(s.offset ?? { x: 0, y: 0 }), toM(s.r))
    case 'box':
      return new Box(toM(s.wh.x / 2), toM(s.wh.y / 2), Vec2(toMV(s.offset ?? { x: 0, y: 0 })), s.angle ?? 0)
    case 'polygon':
      return new Polygon(s.points.map((p) => Vec2(toMV(p))))
  }
}

function make(w: World, type: BodyType, pos: Vec, angle: number, shapes: ShapeSpec[], o: BodyOpts, bullet = false): Body {
  const b = w.pl.createBody({ type, position: toMV(pos), angle, bullet: o.bullet ?? bullet })
  Object.assign(data(b), o.data)
  for (const s of shapes) {
    b.createFixture(toShape(s), {
      density: o.density ?? 1,
      friction: o.friction ?? 0.3,
      restitution: o.restitution ?? 0,
      isSensor: o.sensor ?? false,
    })
  }
  return b
}

/** r in units. Bullet (continuous collision against dynamic bodies) by default; pass bullet: false to opt out. */
export const dynamicCircle = (w: World, pos: Vec, r: number, o: BodyOpts): Body =>
  make(w, 'dynamic', pos, 0, [{ kind: 'circle', r }], o, true)

/** wh is the full width and height in units. */
export const dynamicBox = (w: World, pos: Vec, wh: Vec, angle: number, o: BodyOpts): Body =>
  make(w, 'dynamic', pos, angle, [{ kind: 'box', wh }], o)

export const staticBox = (w: World, pos: Vec, wh: Vec, angle: number, o: BodyOpts): Body =>
  make(w, 'static', pos, angle, [{ kind: 'box', wh }], o)

/** Several fixtures on one body, dynamic unless `type` says otherwise. */
export const compound = (
  w: World,
  pos: Vec,
  shapes: ShapeSpec[],
  o: BodyOpts & { type?: BodyType; angle?: number },
): Body => make(w, o.type ?? 'dynamic', pos, o.angle ?? 0, shapes, o)

/** Solid (non-sensor) outline of a fixture in world units: a convex polygon or a circle. */
export type Outline = { kind: 'poly'; pts: Vec[] } | { kind: 'circle'; c: Vec; r: number }

/** Outlines of the body's non-sensor fixtures, in world units, in fixture order. */
export function outlines(b: Body): Outline[] {
  const out: Outline[] = []
  for (let f = b.getFixtureList(); f; f = f.getNext()) {
    if (f.isSensor()) continue
    const s = f.getShape()
    if (s instanceof Circle) {
      out.push({ kind: 'circle', c: toUV(b.getWorldPoint(s.getCenter())), r: toU(s.getRadius()) })
    } else if (s instanceof Polygon) {
      out.push({ kind: 'poly', pts: s.m_vertices.map((p) => toUV(b.getWorldPoint(p))) })
    }
  }
  return out
}

/**
 * Bodies touching b through solid fixtures right now (as of the last step), with the world normal
 * pointing from the other body toward b, in Planck's contact-list order.
 */
export function touching(b: Body): { other: Body; normal: Vec }[] {
  const out: { other: Body; normal: Vec }[] = []
  for (let e = b.getContactList(); e; e = e.next) {
    const c = e.contact
    if (!e.other || !c.isTouching() || c.getFixtureA().isSensor() || c.getFixtureB().isSensor()) continue
    const n = c.getWorldManifold(null)?.normal
    if (!n) continue
    // Planck's normal points from fixture A to fixture B.
    const s = c.getFixtureB().getBody() === b ? 1 : -1
    out.push({ other: e.other, normal: { x: n.x * s, y: n.y * s } })
  }
  return out
}

/** Takes the body out of the simulation (no collisions, no motion) or puts it back. */
export const setEnabled = (b: Body, on: boolean): void => b.setActive(on)

/** Linear velocity in units/s. */
export function velocity(b: Body): Vec {
  const lv = b.getLinearVelocity()
  return { x: toU(lv.x), y: toU(lv.y) }
}

/** Sets the horizontal velocity (units/s), keeping the vertical one, and wakes the body. */
export function setVelocityX(b: Body, vx: number): void {
  const lv = b.getLinearVelocity()
  b.setLinearVelocity({ x: toM(vx), y: lv.y })
  b.setAwake(true)
}

/** Impulse in kg·units/s at the centre of mass. */
export const applyImpulse = (b: Body, imp: Vec): void =>
  b.applyLinearImpulse(toMV(imp), b.getWorldCenter(), true)
