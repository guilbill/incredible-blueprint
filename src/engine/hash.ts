import type { World } from './world'

const buf = new DataView(new ArrayBuffer(8))

/** FNV-1a 32-bit over the little-endian Float64 bytes of each body's pose and velocities, in creation order. */
export function hashWorld(w: World): string {
  let h = 0x811c9dc5
  const feed = (x: number) => {
    buf.setFloat64(0, x, true)
    for (let i = 0; i < 8; i++) {
      h ^= buf.getUint8(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const b of w.bodies()) {
    const p = b.getPosition()
    const lv = b.getLinearVelocity()
    feed(p.x)
    feed(p.y)
    feed(b.getAngle())
    feed(lv.x)
    feed(lv.y)
    feed(b.getAngularVelocity())
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
