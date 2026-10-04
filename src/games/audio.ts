/*
 * Shared Web Audio engine for the games: one AudioContext, a soft limiter so
 * overlapping sounds never clip, a site-wide Sound on/off setting, and the two
 * building blocks the games' sounds are made of — a crisp click and a sine tone.
 *
 * The AudioContext is created on first use, which is always inside a click,
 * so browsers allow it to start.
 */

// Kept from when only Keno had sound, so players' existing setting carries over
const STORAGE_KEY = 'kk:keno-sound'

let ctx: AudioContext | null = null
let bus: AudioNode | null = null
let noise: AudioBuffer | null = null

let enabled = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
})()

export const isSoundEnabled = () => enabled

export function setSoundEnabled(value: boolean) {
  enabled = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Not persisted; still applies for this visit
  }
}

/** The running AudioContext, or null when sound is off or unsupported. */
export function getAudio() {
  if (!enabled) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 6
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    limiter.connect(ctx.destination)
    bus = limiter

    // 80ms of white noise, reused for every click
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Where every sound connects (the limiter). Call getAudio() first. */
export const getBus = () => bus

/**
 * A crisp click: a noise transient band-passed around `freq`, plus a short
 * sine at `freq / 2` for body. `duration` is the decay time in seconds.
 */
export function click(freq: number, duration: number, volume: number, bodyVolume = 0.35, q = 1.4, delay = 0) {
  const context = getAudio()
  if (!context || !bus || !noise) return
  const t = context.currentTime + delay

  const src = context.createBufferSource()
  src.buffer = noise
  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = freq
  band.Q.value = q
  const env = context.createGain()
  env.gain.setValueAtTime(volume, t)
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(band).connect(env).connect(bus)
  src.start(t)
  src.stop(t + duration + 0.01)

  if (bodyVolume > 0) tone(freq / 2, duration * 1.4, volume * bodyVolume, delay)
}

/** A plain sine with an instant attack and exponential decay (optionally gliding to `endFreq`). */
export function tone(freq: number, duration: number, volume: number, delay = 0, endFreq = freq) {
  const context = getAudio()
  if (!context || !bus) return
  const t = context.currentTime + delay
  const osc = context.createOscillator()
  const env = context.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(volume, t + 0.003)
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(env).connect(bus)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A short generated room (stereo decaying noise) feeding the bus at `wet` level. */
export function makeRoom(context: AudioContext, seconds: number, wet: number) {
  const length = Math.floor(context.sampleRate * seconds)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5)
  }
  const room = context.createConvolver()
  room.buffer = impulse
  const level = context.createGain()
  level.gain.value = wet
  room.connect(level)
  if (bus) level.connect(bus)
  return room
}
