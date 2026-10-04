/*
 * Coinflip sounds, built on the shared engine (../audio.ts): a soft whoosh as
 * the coin is tossed, a flutter of ticks while it spins that slows towards the
 * landing and a metallic clink when it lands; a rising ding per correct call,
 * a fuller chime on cash-out, and a soft low thud on a wrong call.
 */

import { click, getAudio, getBus, tone } from '../audio'

export { isSoundEnabled, setSoundEnabled } from '../audio'

/** Wake the audio engine early (inside the first click) so the toss starts on time. */
export function preloadSounds() {
  getAudio()
}

/** Choosing a side, or Random Choice */
export function playChoose(side: 'heads' | 'tails') {
  click(side === 'heads' ? 3400 : 2900, 0.026, 0.42, 0.16, 2.4)
}

/** Small controls (½, 2x, MAX) */
export function playTick() {
  click(3800, 0.02, 0.18, 0)
}

/** A soft rising whoosh: band-passed noise sweeping up, for the toss. */
function whoosh(duration: number, volume: number) {
  const context = getAudio()
  const bus = getBus()
  if (!context || !bus) return
  const t = context.currentTime
  const length = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = context.createBufferSource()
  src.buffer = buffer
  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.9
  band.frequency.setValueAtTime(500, t)
  band.frequency.exponentialRampToValueAtTime(2400, t + duration * 0.6)
  band.frequency.exponentialRampToValueAtTime(900, t + duration)
  const env = context.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(volume, t + duration * 0.25)
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(band).connect(env).connect(bus)
  src.start(t)
  src.stop(t + duration + 0.02)
}

/**
 * The toss: a firm thumb-flick, the whoosh, then spin ticks that start fast
 * and slow down as the coin comes back down (`duration` in seconds).
 */
export function playToss(duration: number) {
  click(1900, 0.035, 0.42, 0.25)
  whoosh(duration * 0.75, 0.12)
  const ticks = 14
  for (let i = 0; i < ticks; i++) {
    const p = i / ticks
    // Ease the spacing so ticks thin out towards the landing
    const at = duration * 0.85 * (1 - Math.pow(1 - p, 1.6))
    click(4200 - p * 900, 0.012, 0.13 * (1 - p * 0.5), 0, 3, at)
  }
}

/** Landing on the table: a short metallic clink with a soft thud underneath */
export function playLand() {
  click(5200, 0.03, 0.32, 0, 6)
  tone(2350, 0.22, 0.09)
  tone(3520, 0.14, 0.05)
  tone(140, 0.1, 0.25, 0, 90)
}

/** Starting a game: a firm click over a soft low thump */
export function playBet() {
  click(1900, 0.04, 0.45, 0.2)
  tone(170, 0.09, 0.35, 0, 110)
}

const PENTATONIC = [0, 2, 4, 7, 9]

/** A correct call: a quick two-note ding that climbs with the streak */
export function playCorrect(streak: number) {
  const step = Math.min(streak - 1, 9)
  const semitones = 12 * Math.floor(step / 5) + PENTATONIC[step % 5]
  const f = 1046.5 * Math.pow(2, semitones / 12)
  tone(f, 0.28, 0.15, 0.06)
  tone(f * 1.5, 0.34, 0.12, 0.13)
}

/** Cashing out: a bright, fuller chime */
export function playCashout() {
  tone(1568, 0.45, 0.15, 0.04)
  tone(2349, 0.25, 0.05, 0.04)
  tone(2093, 0.6, 0.17, 0.14)
  tone(3136, 0.3, 0.05, 0.14)
  tone(2637, 0.7, 0.13, 0.24)
}

/** A wrong call: a soft, low falling thud — noticeable, never harsh */
export function playLose() {
  tone(260, 0.32, 0.22, 0.05, 150)
  click(700, 0.05, 0.16, 0.3, 1.2, 0.05)
}
