import type { PartKind } from '../level/types'
import { createThrottle, impulseVolume, loadMuted, saveMuted, TICKS_PER_SECOND } from './soundLogic'

/**
 * Synthesized sounds (filtered noise bursts and sine blips, no audio files). The context is created
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
function burst(freq: number, dur: number, vol: number, q = 4, type: BiquadFilterType = 'bandpass'): void {
  const c = live()
  if (!c || !master) return
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = c.currentTime
  const s = c.createBufferSource()
  s.buffer = noiseBuf
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

type Voice = () => void
const voices: Partial<Record<PartKind, Voice>> = {
  trampoline: () => blip(220, 0.18, 0.25, 'sine', 0, 520),
  spring: () => blip(260, 0.16, 0.22, 'sine', 0, 600),
  scissors: () => { burst(5000, 0.05, 0.3, 6, 'highpass'); blip(1800, 0.04, 0.08, 'triangle') },
  candle: () => burst(1200, 0.18, 0.2, 1, 'lowpass'),
  balloon: () => burst(3000, 0.06, 0.45, 0.8, 'highpass'),
  mousetrap: () => { burst(2200, 0.04, 0.45, 2); blip(900, 0.05, 0.2, 'square') },
  cat: () => blip(500, 0.14, 0.18, 'triangle', 0, 330),
  mouse: () => blip(1500, 0.06, 0.12, 'triangle'),
  'mouse-cage': () => blip(1500, 0.06, 0.12, 'triangle'),
  'monkey-bike': () => blip(600, 0.06, 0.15, 'square'),
  magnet: () => blip(140, 0.2, 0.2, 'sine'),
  portal: () => blip(300, 0.25, 0.2, 'sine', 0, 900),
  fan: () => burst(900, 0.2, 0.2, 0.8),
  fishbowl: () => { blip(700, 0.1, 0.18, 'sine', 0, 300); burst(1500, 0.1, 0.12, 1) },
  conveyor: () => blip(180, 0.08, 0.15, 'square'),
  cheese: () => blip(660, 0.06, 0.12, 'sine'),
}
const DEFAULT_VOICE: Voice = () => blip(440, 0.08, 0.18, 'sine')

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
  },
  /** UI action: place, rotate, delete, launch. */
  click(): void {
    safe(() => { burst(2400, 0.03, 0.35, 3); blip(1100, 0.03, 0.08, 'triangle') })
  },
  /** Contact beginning with the given impulse; throttled and scaled by strength. */
  tick(impulse: number): void {
    safe(() => {
      const v = impulseVolume(impulse)
      if (v <= 0 || !live() || !tickAllowed(performance.now())) return
      burst(700 + Math.min(1, v) * 900, 0.04, 0.3 * v, 2.5)
    })
  },
  activate(kind: PartKind): void {
    safe(() => (voices[kind] ?? DEFAULT_VOICE)())
  },
  win(): void {
    safe(() => {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) => blip(f, i === notes.length - 1 ? 0.5 : 0.14, 0.22, 'triangle', i * 0.11))
    })
  },
}
