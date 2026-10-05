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
/** Brightness of the tails blue relative to the model file (see where it is applied) */
const BLUE_TONE = 0.4
/** Pivot angles that show each face to the camera */
const HEADS_ANGLE = Math.PI
const TAILS_ANGLE = 0

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

const CROWN_SCALE = 1.2

/** Traces the crown silhouette (1024px canvas, same UV layout as the model's centre texture) */
function crownPath(g: CanvasRenderingContext2D) {
  g.beginPath()
  // Body with three points
  g.moveTo(300, 640)
  g.lineTo(262, 372)
  g.lineTo(402, 494)
  g.lineTo(512, 300)
  g.lineTo(622, 494)
  g.lineTo(762, 372)
  g.lineTo(724, 640)
  g.closePath()
  // Band
  g.roundRect(292, 664, 440, 74, 18)
  // Jewels on the points
  for (const [x, y, r] of [[262, 354, 34], [512, 278, 38], [762, 354, 34]] as const) {
    g.moveTo(x + r, y)
    g.arc(x, y, r, 0, TAU)
  }
}

type FaceStyle = {
  /** Paints the shape with the current fill (and stroke, if the shape uses one) */
  paint: (g: CanvasRenderingContext2D) => void
  /** Vertical gradient for the shape, top to bottom */
  colors: [string, string]
  /** Pale edge drawn around the shape, if any */
  edge?: string
  /** three.js reads roughness from G and metalness from B */
  metalRough: string
  /** The heads centre's UVs are laid out for a side-to-side flip; ours turns end over end */
  rotate?: boolean
}

/**
 * A raised shape on the coin's navy centre (1024px canvas, the same UV layout as the
 * model's centre texture). Returns colour, bump and metal/roughness maps.
 */
function makeFaceMaps({ paint, colors, edge, metalRough, rotate = false }: FaceStyle) {
  const size = 1024
  const canvas = (background: string, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    g.fillStyle = background
    g.fillRect(0, 0, size, size)
    draw(g)
    const texture = new THREE.CanvasTexture(c)
    texture.flipY = false // glTF UV convention, like the model's own textures
    if (rotate) {
      texture.center.set(0.5, 0.5)
      texture.rotation = Math.PI
    }
    texture.anisotropy = 8
    return texture
  }
  const solid = (g: CanvasRenderingContext2D, color: string) => {
    g.fillStyle = color
    g.strokeStyle = color
    g.lineWidth = 6
    g.lineJoin = 'round'
    paint(g)
  }

  const map = canvas('#070d1e', (g) => {
    const gradient = g.createLinearGradient(0, 240, 0, 780)
    gradient.addColorStop(0, colors[0])
    gradient.addColorStop(1, colors[1])
    g.fillStyle = gradient
    g.strokeStyle = edge ?? gradient
    g.lineWidth = 6
    g.lineJoin = 'round'
    paint(g)
  })
  map.colorSpace = THREE.SRGBColorSpace

  // Raised with soft edges, like the original emblem's lettering
  const bump = canvas('#000', (g) => {
    g.filter = 'blur(7px)'
    solid(g, '#fff')
  })
  const metalness = canvas('rgb(0, 150, 0)', (g) => solid(g, metalRough))

  return { map, bump, metalRough: metalness }
}

/** A material for one of those faces */
function faceMaterial(maps: ReturnType<typeof makeFaceMaps>) {
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: 6,
    metalnessMap: maps.metalRough,
    roughnessMap: maps.metalRough,
    metalness: 1,
    roughness: 1,
  })
}

/** Tails: a blue crown, matching the tails ring (glossy, lightly metallic) */
function makeCrownMaps() {
  return makeFaceMaps({
    paint: (g) => {
      g.save()
      // Centred on the face and sized to match the heads K
      g.translate(512, 512)
      g.scale(CROWN_SCALE, CROWN_SCALE)
      g.translate(-512, -489)
      crownPath(g)
      g.fill()
      g.stroke()
      g.restore()
    },
    colors: ['#4a70e8', '#1d3896'],
    edge: '#8eaaf5',
    metalRough: 'rgb(0, 115, 40)',
  })
}

/** Heads: a single Titan One "K" in the 2D coin's gold gradient (polished gold) */
function makeKMaps() {
  return makeFaceMaps({
    paint: (g) => {
      g.font = '400 720px "Titan One", sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      // Centre on the glyph's own bounds, not the font's line box
      const m = g.measureText('K')
      const x = 512 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
      const y = 512 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
      g.fillText('K', x, y)
    },
    colors: ['#f7d54e', '#c38f12'],
    metalRough: 'rgb(0, 80, 230)',
    rotate: true,
  })
}

/** The heads side's gold (the gold coin model's KK_Gold, which the blue model replaces with blue) */
function makeGold() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.4793, 0.2874, 0.0103, THREE.LinearSRGBColorSpace),
    metalness: 0.9,
    roughness: 0.36,
    side: THREE.DoubleSide,
  })
}

/**
 * Splits a part that wraps both faces into two material groups by which half each
 * triangle sits in: group 0 below the middle (-Y, our heads), group 1 above (+Y, tails).
 */
function splitBySide(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  const count = geometry.index ? geometry.index.count : position.count
  const vertex = (i: number) => (geometry.index ? geometry.index.getX(i) : i)
  const below: number[] = []
  const above: number[] = []
  for (let i = 0; i < count; i += 3) {
    const a = vertex(i)
    const b = vertex(i + 1)
    const c = vertex(i + 2)
    const side = position.getY(a) + position.getY(b) + position.getY(c) < 0 ? below : above
    side.push(a, b, c)
  }
  geometry.setIndex([...below, ...above])
  geometry.clearGroups()
  geometry.addGroup(0, below.length, 0)
  geometry.addGroup(below.length, above.length, 1)
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

    const crown = makeCrownMaps()
    const disposables: { dispose: () => void }[] = [
      shadowTexture,
      crown.map,
      crown.bump,
      crown.metalRough,
      envTexture,
      pmrem,
    ]

    // Angle state: heads (gold ring, emblem) faces the camera at π, tails (navy ring, crown) at 0
    let angle = face === 'heads' ? HEADS_ANGLE : TAILS_ANGLE
    let anim: { id: number; from: number; to: number; start: number; duration: number; height: number } | null = null
    let settle: { start: number } | null = null
    const clock = new THREE.Clock()

    tossRef.current = (t: Toss) => {
      const base = angle - (angle % TAU)
      const fast = reduceMotion || quickRef.current
      const spins = fast ? 1 : SPINS
      const to = base + TAU * spins + (t.result === 'heads' ? HEADS_ANGLE : TAILS_ANGLE)
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
    Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL),
      // The heads K is drawn in Titan One, so the font must be ready first
      document.fonts.load('400 100px "Titan One"').catch(() => undefined),
    ])
      .then(([gltf]) => {
        if (disposed) return
        const k = makeKMaps()
        disposables.push(k.map, k.bump, k.metalRough)
        const model = gltf.scene
        const gold = makeGold()
        // Each part is exported in a tilted "hero" pose; the flip needs it flat
        model.children.forEach((part) => part.quaternion.identity())
        model.rotation.x = Math.PI / 2 // the model's +Y side now faces the camera at angle 0
        pivot.add(model)
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) {
            // The model is the blue coin, and both centres carry the emblem. Our tails is its
            // +Y side (named Heads in the file): blue ring, blue crown. Our heads is its -Y side,
            // turned gold here: gold ring, gold rim segments, a gold K.
            if (mesh.name === 'Inner_Ring_Tails') mesh.material = gold
            // The file's blue is near full brightness; under this scene's key light it clips to
            // pastel, so it is scaled down to read as the intended deep blue on screen
            const blue = mesh.material as THREE.MeshStandardMaterial
            if (blue.name === 'KK_Blue' && !blue.userData.toned) {
              blue.color.multiplyScalar(BLUE_TONE)
              blue.userData.toned = true
            }
            if (mesh.name === 'Outer_Gold_Segments') {
              splitBySide(mesh.geometry)
              mesh.material = [gold, mesh.material as THREE.Material]
            }
            if (mesh.name === 'Center_Tails') mesh.material = faceMaterial(k)
            if (mesh.name === 'Center_Heads') mesh.material = faceMaterial(crown)
            // Keep the body behind the rings and centres where their faces meet
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
