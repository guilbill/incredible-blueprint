import './dmath'
import { Box, Circle, Polygon, Vec2 } from 'planck'
import type { Body, BodyType, Shape } from 'planck'
import type { Vec } from './vec'
import { type BodyData, World, data, toM, toMV } from './world'

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
