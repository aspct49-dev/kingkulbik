import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Side } from '../../games/coinflip/engine'
import './CoinStage.css'

const MODEL_URL = '/models/king-kulbik-coin.glb'
export const TOSS_SECONDS = 1.9
/** Instant flips (setting): a quick single flip instead of the full toss */
export const QUICK_TOSS_SECONDS = 0.35
const SETTLE_SECONDS = 0.55
const SPINS = 5

export type Toss = { id: number; result: Side }

type CoinStageProps = {
  /** Face showing at rest before any toss */
  face: Side
  /** Changing `id` starts a toss that lands on `result` */
  toss: Toss | null
  onLanded: (id: number) => void
  /** Quick single flip (Instant flips setting) */
  quick?: boolean
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const TAU = Math.PI * 2

/** The tails face: a gold crown on navy, drawn at runtime (the model has the emblem on both sides). */
function makeTailsTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const c = size / 2

  const bg = g.createRadialGradient(c, c * 0.8, 20, c, c, c)
  bg.addColorStop(0, '#24467f')
  bg.addColorStop(1, '#0d1a36')
  g.fillStyle = bg
  g.beginPath()
  g.arc(c, c, c, 0, TAU)
  g.fill()

  // Fine ring inside the edge
  g.strokeStyle = 'rgba(240, 185, 30, 0.35)'
  g.lineWidth = 6
  g.beginPath()
  g.arc(c, c, c - 26, 0, TAU)
  g.stroke()

  // Crown
  const gold = g.createLinearGradient(0, 150, 0, 360)
  gold.addColorStop(0, '#ffe27a')
  gold.addColorStop(0.55, '#f0b91e')
  gold.addColorStop(1, '#a8740a')
  g.fillStyle = gold
  g.strokeStyle = '#5c3d00'
  g.lineWidth = 8
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(140, 330)
  g.lineTo(122, 190)
  g.lineTo(196, 250)
  g.lineTo(256, 150)
  g.lineTo(316, 250)
  g.lineTo(390, 190)
  g.lineTo(372, 330)
  g.closePath()
  g.fill()
  g.stroke()
  g.beginPath()
  g.roundRect(140, 342, 232, 34, 10)
  g.fill()
  g.stroke()
  for (const [x, y, r] of [[122, 182, 16], [256, 140, 18], [390, 182, 16]] as const) {
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
    g.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Soft round shadow for under the coin */
function makeShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

/**
 * The 3D coin (three.js). Idle, it floats and sways; on a toss it rises
 * towards the camera spinning end over end (fast, then slowing), lands on the
 * decided face, bounces and settles. Renders only while on screen.
 */
export default function CoinStage({ face, toss, onLanded, quick = false }: CoinStageProps) {
  const quickRef = useRef(quick)
  quickRef.current = quick
  const hostRef = useRef<HTMLDivElement>(null)
  const tossRef = useRef<(t: Toss) => void>(() => {})
  const onLandedRef = useRef(onLanded)
  onLandedRef.current = onLanded
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      setStatus('unsupported')
      return
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2.5, 3, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x5b8dff, 1.6)
    rim.position.set(-3, -1, -2)
    scene.add(rim)

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    camera.position.set(0, 0.1, 5.4)
    camera.lookAt(0, 0, 0)

    // pivot (flip axis X, faces the camera) → model (lies flat in XZ, so turn it up)
    const pivot = new THREE.Group()
    scene.add(pivot)

    const shadowTexture = makeShadowTexture()
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -1.32
    shadow.scale.set(1, 0.35, 1)
    scene.add(shadow)

    const tailsTexture = makeTailsTexture()
    const disposables: { dispose: () => void }[] = [shadowTexture, tailsTexture, envTexture, pmrem]

    // Angle state: 0 = heads towards the camera, π = tails
    let angle = face === 'heads' ? 0 : Math.PI
    let anim: { id: number; from: number; to: number; start: number; duration: number; height: number } | null = null
    let settle: { start: number } | null = null
    const clock = new THREE.Clock()

    tossRef.current = (t: Toss) => {
      const base = angle - (angle % TAU)
      const fast = reduceMotion || quickRef.current
      const spins = fast ? 1 : SPINS
      const to = base + TAU * spins + (t.result === 'heads' ? 0 : Math.PI)
      anim = {
        id: t.id,
        from: angle,
        to: to <= angle ? to + TAU : to,
        start: clock.getElapsedTime(),
        duration: fast ? QUICK_TOSS_SECONDS : TOSS_SECONDS,
        height: fast ? 0.35 : 1,
      }
      settle = null
    }

    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(host)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // Keep the coin comfortably in frame on narrow (portrait) stages
      camera.position.z = w / h < 1 ? 5.4 / Math.max(0.62, w / h) : 5.4
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let disposed = false
    new GLTFLoader()
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return
        const model = gltf.scene
        model.rotation.x = Math.PI / 2 // +Y (the emblem face) now faces the camera at angle 0
        const tails = new THREE.Mesh(
          new THREE.CircleGeometry(0.576, 96),
          new THREE.MeshStandardMaterial({ map: tailsTexture, metalness: 0.35, roughness: 0.45 }),
        )
        tails.rotation.x = Math.PI / 2 // face -Y, just below the bottom face (upright when tails shows)
        tails.position.y = -0.0875
        model.add(tails)
        pivot.add(model)
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) {
            // Every part's underside sits at the same depth (y = -0.085), so the body would
            // z-fight with the rings on the tails side; draw the body slightly behind them.
            if (mesh.name === 'Coin_Body') {
              const body = mesh.material as THREE.Material
              body.polygonOffset = true
              body.polygonOffsetFactor = 2
              body.polygonOffsetUnits = 2
            }
            disposables.push(mesh.geometry)
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach((m) => disposables.push(m))
          }
        })
        setStatus('ready')
      })
      .catch(() => setStatus('unsupported'))

    let frame = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      if (!visible) return
      const now = clock.getElapsedTime()

      let y = 0
      let z = 0
      let wobble = 0
      let sway = reduceMotion ? 0 : Math.sin(now * 0.6) * 0.14
      let tilt = reduceMotion ? 0 : Math.sin(now * 0.9) * 0.05
      let float = reduceMotion ? 0 : Math.sin(now * 1.3) * 0.05

      if (anim) {
        const p = Math.min(1, (now - anim.start) / anim.duration)
        angle = anim.from + (anim.to - anim.from) * easeOutCubic(p)
        const arc = 4 * p * (1 - p) * anim.height // 0 → 1 → 0
        // Rise and come towards the camera, staying inside the stage
        y = arc * 0.42
        z = arc * 0.85
        sway *= 1 - arc
        tilt = 0
        float = 0
        wobble = Math.sin(p * Math.PI * 3) * 0.08 * arc
        if (p >= 1) {
          angle = anim.to
          const id = anim.id
          anim = null
          settle = { start: now }
          onLandedRef.current(id)
        }
      } else if (settle) {
        const s = (now - settle.start) / SETTLE_SECONDS
        if (s >= 1) settle = null
        else {
          const damp = Math.exp(-s * 5)
          y = Math.abs(Math.sin(s * Math.PI * 2.2)) * 0.12 * damp
          tilt = Math.sin(s * Math.PI * 3.2) * 0.16 * damp
          float = 0
        }
      }

      pivot.rotation.set(angle + tilt, sway, wobble)
      pivot.position.set(0, y + float, z)

      // Shadow shrinks and fades as the coin rises
      const lift = Math.max(0, y + float + z * 0.4)
      const s = 1 - Math.min(0.55, lift * 0.45)
      shadow.scale.set(s, 0.35 * s, 1)
      ;(shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 - Math.min(0.6, lift * 0.5)

      renderer.render(scene, camera)
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      shadow.geometry.dispose()
      ;(shadow.material as THREE.Material).dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
    // The scene is built once; `face` only sets the initial resting side
  }, [])

  useEffect(() => {
    if (toss) tossRef.current(toss)
  }, [toss])

  return (
    <div className={`coin-stage coin-stage--${status}`} ref={hostRef}>
      {status === 'loading' && <span className="coin-stage__loading" aria-hidden />}
      {status === 'unsupported' && <span className="coin-stage__fallback">3D view unavailable</span>}
    </div>
  )
}
