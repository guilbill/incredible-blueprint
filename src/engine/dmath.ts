/**
 * Deterministic sin/cos/atan2 built from + - * / only (all exactly rounded by IEEE 754),
 * because Math.sin/cos/atan2 may differ in the last bit between JS engines.
 */

const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.9841269829857949313e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.58969099521155010221e-10
const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.0875723212981748279e-9
const C6 = -1.13596475577881948265e-11

// pi/2 split in 33-bit pieces so k * piece is exact for moderate k (Cody-Waite).
const PIO2_1 = 1.57079632673412561417
const PIO2_2 = 6.0771005063039659766e-11
const PIO2_3 = 2.02226624871116645580e-21
const PIO2_3T = 8.47842766036889956997e-32
const INV_PIO2 = 6.36619772367581382433e-1

const PI = 3.141592653589793
const PIO2 = 1.5707963267948966

const kSin = (x: number): number => {
  const z = x * x
  return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))))
}

const kCos = (x: number): number => {
  const z = x * x
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
}

/** Returns the quadrant (0..3) and the remainder r in about [-pi/4, pi/4]. */
function reduce(x: number): [number, number] {
  const k = Math.floor(x * INV_PIO2 + 0.5)
  const r = x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3 - k * PIO2_3T
  return [((k % 4) + 4) % 4, r]
}

export function dsin(x: number): number {
  const [q, r] = reduce(x)
  switch (q) {
    case 0:
      return kSin(r)
    case 1:
      return kCos(r)
    case 2:
      return -kSin(r)
    default:
      return -kCos(r)
  }
}

export function dcos(x: number): number {
  const [q, r] = reduce(x)
  switch (q) {
    case 0:
      return kCos(r)
    case 1:
      return -kSin(r)
    case 2:
      return -kCos(r)
    default:
      return kSin(r)
  }
}

const TAN_PIO8 = 0.41421356237309503

/** atan for t in [0, 1]. */
function atanUnit(t: number): number {
  let base = 0
  let u = t
  if (t > TAN_PIO8) {
    base = PI / 4
    u = (t - 1) / (t + 1)
  }
  // Taylor series, |u| <= tan(pi/8): the 33rd power term is below 1e-15.
  const z = u * u
  let sum = 0
  for (let n = 31; n >= 1; n -= 2) sum = 1 / n - z * sum
  return base + u * sum
}

export function datan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN
  const ax = x < 0 ? -x : x
  const ay = y < 0 ? -y : y
  if (ax === 0 && ay === 0) return x < 0 || 1 / x < 0 ? (1 / y < 0 ? -PI : PI) : y
  let a = ay > ax ? PIO2 - atanUnit(ax / ay) : atanUnit(ay / ax)
  if (x < 0) a = PI - a
  return y < 0 || (y === 0 && 1 / y < 0) ? -a : a
}

/**
 * Planck captures Math.sin/cos/atan2 in module-level constants when it loads, so a swap around
 * step() has no effect. Instead this replaces them for good, and must be imported before 'planck'.
 */
/** The engine's own Math functions, captured before they are replaced (for tests). */
export const nativeMath = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2 }

export function installDMath(): void {
  Math.sin = dsin
  Math.cos = dcos
  Math.atan2 = datan2
}

installDMath()
