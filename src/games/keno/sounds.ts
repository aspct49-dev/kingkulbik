/*
 * Keno sound design (Web Audio), in the style of casino originals: short,
 * crisp and dry. Clicks are a band-passed noise transient with a little
 * tonal body; the gem hit is the supplied sample; the win is a glassy
 * double-ding. Everything passes through a soft limiter so overlapping
 * sounds never clip.
 *
 * The AudioContext is created on first use, which is always inside a click,
 * so browsers allow it to start.
 */

import gemHitUrl from '../../assets/keno/gem-hit.mp3'

const STORAGE_KEY = 'kk:keno-sound'

let ctx: AudioContext | null = null
let bus: AudioNode | null = null
let noise: AudioBuffer | null = null
let gemBuffer: Promise<AudioBuffer | null> | null = null

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

function audio() {
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

/**
 * A crisp click: a noise transient band-passed around `freq`, plus a short
 * sine at `freq / 2` for body. `duration` is the decay time in seconds.
 */
function click(freq: number, duration: number, volume: number, bodyVolume = 0.35, q = 1.4) {
  const context = audio()
  if (!context || !bus || !noise) return
  const t = context.currentTime

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

  if (bodyVolume > 0) tone(freq / 2, duration * 1.4, volume * bodyVolume)
}

/** A plain sine with an instant attack and exponential decay. */
function tone(freq: number, duration: number, volume: number, delay = 0, endFreq = freq) {
  const context = audio()
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

function loadGem(context: AudioContext) {
  gemBuffer ??= fetch(gemHitUrl)
    .then((res) => res.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .catch(() => null)
  return gemBuffer
}

/** Wake the audio engine and decode the gem sample early, so the first hit plays on time. */
export function preloadSounds() {
  const context = audio()
  if (context) void loadGem(context)
}

/** Picking a tile: a crisp click that lifts slightly with each pick. Un-picking is duller. */
export function playSelect(picked: boolean, count: number) {
  // Sharp and bright: higher pitch, tighter band, short decay, little low body
  if (picked) click(3600 + Math.min(count, 10) * 110, 0.026, 0.46, 0.16, 2.4)
  else click(2400, 0.024, 0.32, 0.12, 2.2)
}

/** Bet placed: a firm click over a soft low thump */
export function playBet() {
  click(1900, 0.04, 0.45, 0.2)
  tone(170, 0.09, 0.35, 0, 110)
}

/** A drawn tile that isn't one of the picks: a quick muted tick */
export function playReveal(index: number) {
  click(1250 + (index % 3) * 60, 0.03, 0.28, 0.25)
}

let gemReverb: ConvolverNode | null = null

/** A small, soft room used only to give the gem hit a bit of bloom. */
function gemRoom(context: AudioContext) {
  if (!gemReverb && bus) {
    const length = Math.floor(context.sampleRate * 1.1)
    const impulse = context.createBuffer(2, length, context.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5)
    }
    gemReverb = context.createConvolver()
    gemReverb.buffer = impulse
    const wet = context.createGain()
    wet.gain.value = 0.16
    gemReverb.connect(wet).connect(bus)
  }
  return gemReverb
}

/**
 * A drawn pick: the gem sample, mostly as-is, with the edge taken off — a
 * 10ms fade-in rounds the initial strike, a gentle high-shelf trims only the
 * harshest highs, and a light room adds bloom. Each further hit is a little higher.
 */
export function playGemHit(hitNumber: number) {
  const context = audio()
  if (!context || !bus) return
  void loadGem(context).then((buffer) => {
    if (!buffer || !bus) return
    const t = context.currentTime
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 1 + Math.min(hitNumber - 1, 9) * 0.06

    const shelf = context.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 3800
    shelf.gain.value = -6

    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.01)

    source.connect(shelf).connect(gain)
    gain.connect(bus)
    const room = gemRoom(context)
    if (room) gain.connect(room)
    source.start(t)
  })
}

/** Round paid out: a short glassy double-ding after the last tile */
export function playWin() {
  tone(1760, 0.5, 0.16, 0.22)
  tone(2637, 0.3, 0.05, 0.22)
  tone(2349, 0.65, 0.18, 0.32)
  tone(3520, 0.35, 0.05, 0.32)
}

/** Small controls (½, 2x, Clear Table, Difficulty): a light tick */
export function playTick() {
  click(3800, 0.02, 0.18, 0)
}
