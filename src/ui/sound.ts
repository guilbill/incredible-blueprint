import type { PartKind } from '../level/types'
import { createThrottle, type ImpactVoice, impulseVolume, loadMuted, type LoopName, saveMuted, TICKS_PER_SECOND } from './soundLogic'

/**
 * * Synthesized sounds (filtered noise bursts, sine blips and a few baked loops, no audio files). The context is created
 * on the first user gesture. Every call is wrapped: a missing or blocked AudioContext only means
 * silence. Sound only observes the game, it never feeds back into the simulation.
 */

type Ctx = AudioContext
let ctx: Ctx | undefined
let master: GainNode | undefined
let muted = loadMuted()
let armed = false
const tickAllowed = createThrottle(TICKS_PER_SECOND)

function safe(fn: () => void): void {
  try {
    fn()
  } catch {
    /* no audio, no problem */
  }
}

function ensure(): Ctx | undefined {
  if (ctx) return ctx
  safe(() => {
    const C: typeof AudioContext | undefined = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  })
  return ctx
}

/** Context ready to play, or undefined when muted, unavailable or not yet unlocked by a gesture. */
function live(): Ctx | undefined {
  if (muted || !ctx || !master) return undefined
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

function blip(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, endFreq = freq): void {
  const c = live()
  if (!c || !master) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

let noiseBuf: AudioBuffer | undefined
function burst(freq: number, dur: number, vol: number, q = 4, type: BiquadFilterType = 'bandpass', delay = 0): void {
  const c = live()
  if (!c || !master) return
  const t = c.currentTime + delay
  const s = c.createBufferSource()
  s.buffer = burstBuffer(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t)
  s.stop(t + dur + 0.02)
}

/** Note with a pitch slide and an optional vibrato (depth in Hz, rate in Hz). */
function tone(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, vib = 0, vibRate = 0): void {
  const c = live()
  if (!c || !master) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  if (vib) {
    const l = c.createOscillator()
    const lg = c.createGain()
    l.frequency.value = vibRate
    lg.gain.value = vib
    l.connect(lg).connect(o.frequency)
    l.start(t)
    l.stop(t + dur + 0.02)
  }
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

/** Filtered noise whose filter sweeps from `freq` to `endFreq`, held at full volume for `hold` s. */
function sweep(freq: number, endFreq: number, dur: number, vol: number, type: BiquadFilterType, hold = 0, delay = 0): void {
  const c = live()
  if (!c || !master) return
  const t = c.currentTime + delay
  const s = c.createBufferSource()
  s.buffer = longNoise(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  f.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03)
  if (hold) g.gain.setValueAtTime(vol, t + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t)
  s.stop(t + dur + 0.02)
}

let noise2s: AudioBuffer | undefined
function longNoise(c: Ctx): AudioBuffer {
  if (!noise2s) noise2s = bake(c, 2, () => Math.random() * 2 - 1)
  return noise2s
}
/** The short noise buffer `burst` uses, created on first need. */
function burstBuffer(c: Ctx): AudioBuffer {
  if (!noiseBuf) noiseBuf = bake(c, 0.25, () => Math.random() * 2 - 1)
  return noiseBuf
}

/** Mono buffer of `seconds`, sample i = fn(time in s). */
function bake(c: Ctx, seconds: number, fn: (t: number) => number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = fn(i / c.sampleRate)
  return b
}

type Voice = () => void
/** One-shot sound of a part when it starts acting. Parts without a voice (candle, pulley…) stay silent. */
const voices: Partial<Record<PartKind, Voice>> = {
  spring: () => tone(180, 140, 0.6, 0.4, 'sine', 0, 30, 22),
  scissors: () => { burst(5000, 0.025, 0.4, 1, 'highpass'); burst(5000, 0.025, 0.4, 1, 'highpass', 0.06) },
  balloon: () => sweep(300, 900, 0.7, 0.35, 'lowpass', 0.4),
  mousetrap: () => { burst(2000, 0.03, 0.6, 1, 'highpass'); tone(220, 120, 0.06, 0.12, 'square') },
  cat: () => { tone(600, 900, 0.15, 0.25, 'triangle'); tone(900, 500, 0.25, 0.25, 'triangle', 0.13) },
  mouse: () => { tone(3200, 3900, 0.06, 0.18); tone(3500, 2900, 0.07, 0.18, 'sine', 0.08) },
  'mouse-cage': () => {
    for (let i = 0; i < 12; i++) burst(4000, 0.008, 0.15, 1, 'highpass', i * 0.09)
    tone(2900, 3400, 0.08, 0.12, 'sine', 0.5)
  },
  'monkey-bike': () => { for (let i = 0; i < 10; i++) tone(1500, 1500, 0.012, 0.05, 'square', i * 0.13) },
  portal: () => { tone(200, 900, 0.3, 0.2); tone(900, 300, 0.3, 0.15, 'sine', 0.25) },
  fishbowl: () => {
    for (let i = 0; i < 5; i++) {
      const f = 2200 + Math.random() * 2500
      tone(f, f, 0.15, 0.08, 'sine', i * 0.025)
    }
    tone(700, 150, 0.25, 0.3, 'sine', 0.15)
  },
}

/** Contact sounds: each ball by its material, the trampoline's canvas, brick and wood walls. */
const impacts: Record<ImpactVoice, (v: number) => void> = {
  trampoline: (v) => { tone(90, 260, 0.3, 0.5 * v, 'triangle'); sweep(300, 900, 0.25, 0.2 * v, 'lowpass') },
  'ball-bowling': (v) => { tone(90, 40, 0.35, 0.6 * v); burst(400, 0.12, 0.4 * v, 1, 'lowpass') },
  'ball-basket': (v) => { tone(170, 110, 0.22, 0.5 * v); burst(380, 0.18, 0.3 * v, 5) },
  'ball-base': (v) => { burst(1200, 0.06, 0.45 * v, 2); tone(320, 220, 0.07, 0.3 * v) },
  'ball-tennis': (v) => { burst(1400, 0.07, 0.45 * v, 1, 'lowpass'); tone(300, 220, 0.05, 0.2 * v) },
  'wall-brick': (v) => { burst(600, 0.08, 0.5 * v, 1, 'lowpass'); tone(110, 70, 0.1, 0.3 * v) },
  'wall-wood': (v) => { tone(220, 180, 0.14, 0.4 * v, 'triangle'); tone(660, 600, 0.06, 0.12 * v) },
  tick: (v) => burst(700 + v * 900, 0.04, 0.3 * v, 2.5),
}

/** A running loop: stop() fades it out. */
interface Loop { stop(): void }
const playing = new Map<LoopName, Loop>()

/** Starts looping sources behind a gain that fades in; stop() fades out and ends them. */
function loopVoice(c: Ctx, vol: number, build: (into: AudioNode) => AudioScheduledSourceNode[]): Loop {
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.15)
  g.connect(master!)
  const sources = build(g)
  for (const s of sources) s.start(t)
  return {
    stop() {
      const e = c.currentTime
      g.gain.cancelScheduledValues(e)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), e)
      g.gain.exponentialRampToValueAtTime(0.0001, e + 0.2)
      for (const s of sources) s.stop(e + 0.25)
    },
  }
}

function looped(c: Ctx, buffer: AudioBuffer): AudioBufferSourceNode {
  const s = c.createBufferSource()
  s.buffer = buffer
  s.loop = true
  return s
}

/** Oscillator at `freq` through a lowpass, its amplitude wobbling at `rate` by `depth` (0..1). */
function tremolo(c: Ctx, into: AudioNode, freq: number, type: OscillatorType, rate: number, depth: number, lowpass: number): AudioScheduledSourceNode[] {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = freq
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  const tg = c.createGain()
  tg.gain.value = 1 - depth
  const l = c.createOscillator()
  l.frequency.value = rate
  const lg = c.createGain()
  lg.gain.value = depth
  l.connect(lg).connect(tg.gain)
  o.connect(f).connect(tg).connect(into)
  return [o, l]
}

const decay = (t: number, len: number): number => (t < len ? Math.exp((-6 * t) / len) : 0)

/** Continuous sounds, one per kind of running part. */
const loopVoices: Record<LoopName, (c: Ctx) => Loop> = {
  // a dull notched click every 0.1 s: a filtered noise tick plus a low thump
  gears: (c) => loopVoice(c, 0.5, (into) => {
    const ticks = looped(c, bake(c, 0.1, (t) => (Math.random() * 2 - 1) * decay(t, 0.02)))
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1500
    f.Q.value = 4
    ticks.connect(f).connect(into)
    const thump = looped(c, bake(c, 0.1, (t) => Math.sin(2 * Math.PI * 300 * t) * decay(t, 0.02) * 0.3))
    thump.connect(into)
    return [ticks, thump]
  }),
  // a squeak rising from 1150 to 1450 Hz with a 30 Hz wobble, every third of a second
  pulley: (c) => loopVoice(c, 0.15, (into) => {
    let phase = 0
    let last = 0
    const s = looped(c, bake(c, 0.33, (t) => {
      if (t > 0.18) return 0
      const f = 1150 * Math.pow(1450 / 1150, t / 0.18) + 50 * Math.sin(2 * Math.PI * 30 * t)
      phase += 2 * Math.PI * f * (t - last)
      last = t
      return Math.sin(phase) * Math.min(1, t / 0.05) * Math.exp((-4 * t) / 0.18)
    }))
    s.connect(into)
    return [s]
  }),
  conveyor: (c) => loopVoice(c, 0.12, (into) => tremolo(c, into, 55, 'sawtooth', 7, 0.4, 300)),
  magnet: (c) => loopVoice(c, 0.12, (into) => [...tremolo(c, into, 100, 'sine', 8, 0.4, 800), ...tremolo(c, into, 200, 'sine', 8, 0.4, 800)]),
  fan: (c) => loopVoice(c, 0.18, (into) => {
    const air = looped(c, longNoise(c))
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 900
    air.connect(f).connect(into)
    return [air, ...tremolo(c, into, 40, 'sine', 20, 0.8, 200)]
  }),
}

/**
 * End-of-level tune at 144 bpm: G4 dotted eighth held, C#5 tied smoothly into D5, then D5 and [G5 + B5] staccato. `at` is
 * when a note starts and `len` how long it sounds (s). Humanized by hand: `late` nudges each onset,
 * `vel` its loudness, and `roll` spreads the chord from the lower note up.
 */
const WIN_Q = 60 / 144
const WIN_TUNE: { at: number; len: number; freqs: number[]; late: number; vel: number; roll?: number }[] = [
  { at: 0, len: 0.75 * WIN_Q, freqs: [392], late: 0, vel: 0.9 },
  { at: 0.75 * WIN_Q, len: 0.5 * WIN_Q, freqs: [554.37], late: 0.006, vel: 0.75 },
  { at: 1.25 * WIN_Q, len: 0.1, freqs: [587.33], late: 0, vel: 0.85 },
  { at: 2 * WIN_Q, len: 0.1, freqs: [783.99, 987.77], late: 0.015, vel: 1, roll: 0.018 },
]

/** Soft piano: harmonics 1 to 5 with fast attacks, the high ones dying faster, as on a struck string. */
function pianoNote(c: Ctx, out: AudioNode, freq: number, t: number, len: number): void {
  ;[1, 0.45, 0.25, 0.12, 0.06].forEach((amp, i) => {
    const decay = 2.2 / (1 + i * 0.8)
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.value = freq * (i + 1) * (1 + i * 0.0008)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + Math.min(len, decay) + 0.02)
  })
}

export const sound = {
  /** Listens for the first click or keypress to create the AudioContext (browsers require a gesture). */
  arm(): void {
    if (armed || typeof window === 'undefined') return
    armed = true
    const unlock = (): void => {
      safe(() => {
        const c = ensure()
        if (c?.state === 'suspended') void c.resume().catch(() => undefined)
      })
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
  },
  isMuted: (): boolean => muted,
  setMuted(m: boolean): void {
    muted = m
    saveMuted(m)
    if (m) sound.stopLoops()
  },
  /** UI action: place, rotate, delete, launch. */
  click(): void {
    safe(() => { burst(2400, 0.03, 0.35, 3); blip(1100, 0.03, 0.08, 'triangle') })
  },
  /** New contact with the given impulse, voiced by the material that hit; throttled and scaled by strength. */
  impact(voice: ImpactVoice, impulse: number): void {
    safe(() => {
      const v = impulseVolume(impulse)
      if (v <= 0 || !live() || !tickAllowed(performance.now())) return
      impacts[voice](Math.min(1, v))
    })
  },
  /** A part just started acting (the cat woke up, the trap snapped…). */
  activate(kind: PartKind): void {
    safe(() => voices[kind]?.())
  },
  /** Keeps exactly these loops playing: starts the new ones, fades out the others. */
  setLoops(names: ReadonlySet<LoopName>): void {
    safe(() => {
      const c = live()
      for (const [name, loop] of playing) {
        if (c && names.has(name)) continue
        loop.stop()
        playing.delete(name)
      }
      if (!c) return
      for (const name of names) if (!playing.has(name)) playing.set(name, loopVoices[name](c))
    })
  },
  stopLoops(): void {
    sound.setLoops(new Set())
  },
  /** Guillaume's end-of-level tune on a soft additive piano (see WIN_TUNE). */
  win(): void {
    safe(() => {
      const c = live()
      if (!c || !master) return
      const t0 = c.currentTime + 0.02
      for (const n of WIN_TUNE) {
        for (const [i, f] of n.freqs.entries()) {
          const t = t0 + n.at + n.late + i * (n.roll ?? 0)
          const level = (0.44 * n.vel) / Math.sqrt(n.freqs.length)
          const g = c.createGain()
          g.gain.setValueAtTime(level, t)
          g.gain.setValueAtTime(level, t + n.len)
          g.gain.exponentialRampToValueAtTime(0.0001, t + n.len + 0.12)
          g.connect(master)
          pianoNote(c, g, f, t, n.len + 0.15)
        }
      }
    })
  },
}
