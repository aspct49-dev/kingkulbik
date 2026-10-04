/*
 * Keno sound design, in the style of casino originals: short, crisp and dry.
 * Clicks are a band-passed noise transient with a little tonal body; the gem
 * hit is the supplied sample; the win is a glassy double-ding. The audio
 * engine (context, limiter, Sound setting) is shared: see ../audio.ts.
 */

import gemHitUrl from '../../assets/keno/gem-hit.mp3'
import { click, getAudio, getBus, makeRoom, tone } from '../audio'

export { isSoundEnabled, setSoundEnabled } from '../audio'

let gemBuffer: Promise<AudioBuffer | null> | null = null
let gemReverb: ConvolverNode | null = null

function loadGem(context: AudioContext) {
  gemBuffer ??= fetch(gemHitUrl)
    .then((res) => res.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .catch(() => null)
  return gemBuffer
}

/** Wake the audio engine and decode the gem sample early, so the first hit plays on time. */
export function preloadSounds() {
  const context = getAudio()
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

/**
 * A drawn pick: the gem sample, mostly as-is, with the edge taken off — a
 * 10ms fade-in rounds the initial strike, a gentle high-shelf trims only the
 * harshest highs, and a light room adds bloom. Each further hit is a little higher.
 */
export function playGemHit(hitNumber: number) {
  const context = getAudio()
  if (!context || !getBus()) return
  void loadGem(context).then((buffer) => {
    const bus = getBus()
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
    gemReverb ??= makeRoom(context, 1.1, 0.16)
    gain.connect(gemReverb)
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
