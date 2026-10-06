import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import BallViewer from './BallViewer'
import { ballMaterial, ballTexture, studioEnvironment } from './studio'
import './RaffleMachine.css'

/*
 * The raffle machine (public/models/raffle-machine.glb): name balls tumble in
 * the globe while the paddles turn. A draw mixes hard, lifts the winning ball
 * out of the top, rolls it down the tube and drops it on the pedestal.
 *
 * The result always comes from the server; this only shows it.
 */

const MODEL_URL = '/models/raffle-machine.glb'
const MAX_BALLS = 40
const BALL_R = 0.125
/** Globe centre and inner radius (Ball_Chamber: radius 0.95 at y 1.95) */
const CENTER = new THREE.Vector3(0, 1.95, 0)
const INNER_R = 0.9 - BALL_R
/** Where the winner sits on the pedestal (WinningBall_Target) */
const TARGET = new THREE.Vector3(2.3, 0.6, 1.1)
/** The winner's ball is shown bigger on the pedestal */
const PEDESTAL_SCALE = 1.5
const PEDESTAL_AT = TARGET.clone().setY(TARGET.y + BALL_R * (PEDESTAL_SCALE - 1))

/** The tube's centreline, traced from Ball_Tube's geometry: up from the exit, over, down the zigzag */
const TUBE_POINTS: [number, number, number][] = [
  [0, 2.86, 0], [-0.02, 3.02, 0], [-0.04, 3.21, 0], [-0.06, 3.39, 0], [0.11, 3.62, 0], [0.47, 3.79, 0], [0.89, 3.84, 0],
  [1.41, 3.84, 0], [1.99, 3.82, 0], [2.45, 3.67, 0], [2.57, 3.28, 0], [2.23, 3.12, 0], [1.84, 2.97, 0], [1.77, 2.69, 0],
  [2.13, 2.5, 0], [2.57, 2.39, 0], [2.65, 2.07, 0], [2.32, 1.93, 0], [1.96, 1.81, 0], [1.91, 1.58, 0], [2.13, 1.42, -0.08],
  [2.44, 1.4, -0.09], [2.64, 1.39, 0.08], [2.64, 1.42, 0.3], [2.53, 1.53, 0.53], [2.43, 1.62, 0.74], [2.39, 1.73, 0.89],
  [2.34, 1.83, 1.0], [2.29, 1.74, 1.12], [2.29, 1.59, 1.12],
]

const MIX_S = 2.6
const RISE_S = 0.8
const TUBE_S = 2.6
const DROP_S = 0.55

/**
 * Surface finish per GLB material, matching the Blender render: polished gold,
 * chrome-like silver, and lacquered navy (glossy, not a mirror). Colours stay
 * as modelled.
 */
const FINISH: Record<string, Partial<THREE.MeshPhysicalMaterial>> = {
  KK_Gold: { metalness: 1, roughness: 0.24 },
  KK_Gold_Highlight: { metalness: 1, roughness: 0.18 },
  KK_Gold_Glow: { metalness: 0.9, roughness: 0.22 },
  KK_Silver: { metalness: 1, roughness: 0.14 },
  KK_Navy: { metalness: 0.3, roughness: 0.32 },
  KK_Navy_Deep: { metalness: 0.3, roughness: 0.36 },
  KK_Blue_Dark: { metalness: 0.25, roughness: 0.3 },
  KK_Gunmetal: { metalness: 0.4, roughness: 0.3 },
}

/**
 * The card's backdrop (RaffleMachine.css), drawn inside the scene: glass
 * refracts what is rendered behind it, and a transparent canvas gives it
 * nothing, which turns the tube milky.
 */
function backdropTexture() {
  const w = 1024
  const h = 768
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const base = g.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#111a2e')
  base.addColorStop(1, '#0e1219')
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  const glow = (x: number, y: number, rx: number, ry: number, rgb: string, a: number) => {
    g.save()
    g.translate(x * w, y * h)
    g.scale(rx * w, ry * h)
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    r.addColorStop(0, `rgba(${rgb},${a})`)
    r.addColorStop(0.7, `rgba(${rgb},0)`)
    g.fillStyle = r
    g.fillRect(-1, -1, 2, 2)
    g.restore()
  }
  glow(0.4, 0.55, 0.55, 0.6, '47,96,200', 0.22)
  glow(0.74, 0.78, 0.3, 0.35, '240,185,30', 0.12)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A soft dark ellipse for under the bases: contact shadow and ambient occlusion where they meet the floor */
function contactShadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(0,0,0,0.75)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.4)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

type Ball = {
  name: string
  /** Which of the ball colours (the close-up uses the same) */
  colorIndex: number
  mesh: THREE.Mesh
  vel: THREE.Vector3
  spin: THREE.Vector3
}

export type RaffleDrawShow = {
  /** Changes for each new draw */
  key: string
  name: string
}

type Props = {
  /** Names on the balls (up to 40 are shown) */
  names: string[]
  /** A new key plays the draw and lands on `name` */
  draw: RaffleDrawShow | null
  /** Shows the latest winner on the pedestal without playing (page load) */
  resting?: string | null
  onDrawn?: (key: string) => void
  /** Smaller camera margins (stream overlay) */
  tight?: boolean
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export default function RaffleMachine({ names, draw, resting = null, onDrawn, tight }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading')
  const [winner, setWinner] = useState<{ key: string; name: string; shown: boolean } | null>(
    resting ? { key: 'rest', name: resting, shown: true } : null,
  )
  const api = useRef<{ setNames: (n: string[]) => void; play: (d: RaffleDrawShow) => void; rest: (n: string | null) => void } | null>(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const seenDraw = useRef<string | null>(draw?.key ?? null)
  /** The ball open in the close-up viewer */
  const [inspect, setInspect] = useState<{ name: string; colorIndex: number } | null>(null)

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
    // Colour management as in Blender's Filmic/ACES view: linear lighting, ACES tone map, sRGB out
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    // PCF with a radius gives soft shadow edges (PCFSoft ignores the radius)
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(renderer.domElement)
    const anisotropy = renderer.capabilities.getMaxAnisotropy()

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = studioEnvironment()
    const envTexture = pmrem.fromScene(studio, 0.02).texture
    studio.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
    scene.environment = envTexture
    const backdrop = backdropTexture()
    scene.background = backdrop

    const look = new THREE.Vector3(1.03, 1.95, 0.35)
    // Three-point studio lighting, plus a faint top light
    const key = new THREE.DirectionalLight(0xfff3e2, 2.6)
    key.position.set(look.x + 3.5, look.y + 6, look.z + 6)
    key.target.position.copy(look)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 5
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 })
    const fill = new THREE.DirectionalLight(0xcfdcff, 0.7)
    fill.position.set(look.x - 6, look.y + 1.5, look.z + 4)
    const rim = new THREE.DirectionalLight(0x6f9bff, 1.8)
    rim.position.set(look.x - 2, look.y + 3, look.z - 6)
    const top = new THREE.DirectionalLight(0xffffff, 0.35)
    top.position.set(look.x, look.y + 8, look.z)
    for (const light of [key, fill, rim, top]) {
      light.target.position.copy(look)
      scene.add(light, light.target)
    }
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 0.15))
    // A warm glow on the pedestal
    const spot = new THREE.PointLight(0xffd36b, 0, 3)
    spot.position.set(TARGET.x, TARGET.y + 0.9, TARGET.z + 0.6)
    scene.add(spot)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)

    const tube = new THREE.CatmullRomCurve3(TUBE_POINTS.map((p) => new THREE.Vector3(...p)))
    const ballGeometry = new THREE.SphereGeometry(BALL_R, 28, 20)
    const disposables: { dispose: () => void }[] = [envTexture, pmrem, ballGeometry, backdrop]
    const machine = new THREE.Group()
    scene.add(machine)
    const paddles: THREE.Object3D[] = []

    let balls: Ball[] = []
    let colorCursor = 0
    const makeBall = (name: string, at?: THREE.Vector3): Ball => {
      const colorIndex = colorCursor++
      const map = ballTexture(name, colorIndex, anisotropy)
      const mat = ballMaterial(map)
      const mesh = new THREE.Mesh(ballGeometry, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      const start =
        at ??
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.1,
          CENTER.y - 0.5 + Math.random() * 0.6,
          (Math.random() - 0.5) * 1.1,
        ).sub(CENTER).clampLength(0, INNER_R * 0.9).add(CENTER)
      mesh.position.copy(start)
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0)
      machine.add(mesh)
      return { name, colorIndex, mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(2) }
    }
    const dropBall = (b: Ball) => {
      machine.remove(b.mesh)
      const m = b.mesh.material as THREE.MeshPhysicalMaterial
      m.map?.dispose()
      m.dispose()
    }

    let lastNames: string[] = []
    const setNames = (list: string[]) => {
      lastNames = list
      const want = list.slice(0, MAX_BALLS)
      const keep = new Map(balls.map((b) => [b.name, b]))
      const next: Ball[] = []
      for (const n of want) {
        const have = keep.get(n)
        if (have) {
          next.push(have)
          keep.delete(n)
        } else next.push(makeBall(n))
      }
      keep.forEach((b) => b !== show?.ball && dropBall(b))
      balls = next
    }

    // ---- the draw
    type Show = { key: string; name: string; ball: Ball; start: number; from: THREE.Vector3 }
    let show: Show | null = null
    let pedestal: Ball | null = null
    const clock = new THREE.Clock()

    const rest = (name: string | null) => {
      if (pedestal) dropBall(pedestal)
      pedestal = null
      if (!name) return
      pedestal = makeBall(name, PEDESTAL_AT.clone())
      pedestal.mesh.scale.setScalar(PEDESTAL_SCALE)
      spot.intensity = 1.2
    }

    const play = (d: RaffleDrawShow) => {
      if (pedestal) {
        dropBall(pedestal)
        pedestal = null
      }
      // The winner's ball (made if they aren't among the balls on show)
      let ball = balls.find((b) => b.name === d.name)
      if (!ball) {
        ball = makeBall(d.name)
        balls.push(ball)
      }
      show = { key: d.key, name: d.name, ball, start: clock.getElapsedTime() + (reduceMotion ? -MIX_S : 0), from: new THREE.Vector3() }
      spot.intensity = 0
      setWinner({ key: d.key, name: d.name, shown: false })
    }

    api.current = { setNames, play, rest }

    // ---- physics in the globe
    const tmp = new THREE.Vector3()
    const step = (dt: number, intensity: number, now: number) => {
      const g = 3.2
      for (const b of balls) {
        if (show && b === show.ball && now - show.start > MIX_S) continue
        const p = b.mesh.position
        b.vel.y -= g * dt
        // Swirl round the axis and air from below: harder while mixing
        tmp.set(-(p.z - CENTER.z), 0, p.x - CENTER.x).normalize()
        b.vel.addScaledVector(tmp, intensity * 2.4 * dt)
        if (p.y < CENTER.y - 0.35) b.vel.y += intensity * (5 + Math.random() * 6) * dt
        b.vel.x += (Math.random() - 0.5) * intensity * 3 * dt
        b.vel.z += (Math.random() - 0.5) * intensity * 3 * dt
        b.vel.multiplyScalar(1 - 0.6 * dt)
        p.addScaledVector(b.vel, dt)
        // The globe
        tmp.copy(p).sub(CENTER)
        const d = tmp.length()
        if (d > INNER_R) {
          tmp.multiplyScalar(1 / d)
          p.copy(CENTER).addScaledVector(tmp, INNER_R)
          const vn = b.vel.dot(tmp)
          if (vn > 0) b.vel.addScaledVector(tmp, -1.7 * vn)
        }
        b.mesh.rotation.x += b.spin.x * dt * (0.4 + intensity)
        b.mesh.rotation.y += b.spin.y * dt * (0.4 + intensity)
      }
      // Balls push each other apart
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i]
          const b = balls[j]
          tmp.copy(b.mesh.position).sub(a.mesh.position)
          const d = tmp.length()
          if (d > 0 && d < BALL_R * 2) {
            tmp.multiplyScalar(1 / d)
            const push = (BALL_R * 2 - d) / 2
            a.mesh.position.addScaledVector(tmp, -push)
            b.mesh.position.addScaledVector(tmp, push)
            const rel = b.vel.dot(tmp) - a.vel.dot(tmp)
            if (rel < 0) {
              a.vel.addScaledVector(tmp, rel * 0.9)
              b.vel.addScaledVector(tmp, -rel * 0.9)
            }
          }
        }
      }
    }

    // ---- load
    let disposed = false
    new GLTFLoader()
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return
        machine.add(gltf.scene)
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (o.name.startsWith('Mixing_Paddle') || o.name.startsWith('Mixing_Hub')) paddles.push(o)
          if (!mesh.isMesh) return
          mesh.castShadow = true
          mesh.receiveShadow = true
          const mat = mesh.material as THREE.MeshPhysicalMaterial
          const finish = FINISH[mat.name]
          if (finish) Object.assign(mat, finish)
          // The acrylic as real glass: refraction through transmission, IOR from the GLB (1.45)
          if (mat.name === 'KK_Acrylic') {
            const glass = new THREE.MeshPhysicalMaterial({
              name: mat.name,
              color: 0xf2f7ff,
              metalness: 0,
              roughness: 0.04,
              transmission: 1,
              ior: mat.ior || 1.45,
              thickness: 0.08,
              attenuationColor: new THREE.Color(0xa8c8ff),
              attenuationDistance: 1.5,
              specularIntensity: 1,
              envMapIntensity: 0.8,
            })
            mat.dispose()
            mesh.material = glass
            // Clear things cast almost no shadow
            mesh.castShadow = false
          }
          disposables.push(mesh.geometry)
          disposables.push(mesh.material as THREE.Material)
        })

        // The floor: real shadows from the key light, plus a soft contact shadow under the bases
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const floorY = box.min.y + 0.002
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.32 }))
        floor.rotation.x = -Math.PI / 2
        floor.position.set(look.x, floorY, look.z)
        floor.receiveShadow = true
        const contactMap = contactShadowTexture()
        const contact = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, toneMapped: false }),
        )
        contact.rotation.x = -Math.PI / 2
        contact.position.set((box.min.x + box.max.x) / 2, floorY + 0.001, (box.min.z + box.max.z) / 2)
        contact.scale.set((box.max.x - box.min.x) * 1.15, (box.max.z - box.min.z) * 1.3, 1)
        machine.add(floor, contact)
        disposables.push(floor.geometry, floor.material, contact.geometry, contact.material, contactMap)
        setStatus('ready')
      })
      .catch(() => setStatus('unsupported'))

    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(host)

    // Click a ball (in the globe or on the pedestal) to see it up close
    const canvas = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const ballAt = (e: PointerEvent | MouseEvent): Ball | null => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const all = pedestal ? [...balls, pedestal] : balls
      const hit = raycaster.intersectObjects(all.map((b) => b.mesh), false)[0]
      return hit ? (all.find((b) => b.mesh === hit.object) ?? null) : null
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') canvas.classList.toggle('is-pickable', ballAt(e) !== null)
    }
    const onClick = (e: MouseEvent) => {
      const b = ballAt(e)
      if (b) setInspect({ name: b.name, colorIndex: b.colorIndex })
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('click', onClick)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // Fit the whole machine, base included (about 4.9 wide, 4.7 tall), at any aspect
      const fit = Math.max(4.9 / (w / h), 4.7) * (tight ? 0.92 : 1)
      const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const aim = look.clone().setY(look.y - 0.2)
      camera.position.set(aim.x + 0.6, aim.y + 0.55, aim.z + dist)
      camera.lookAt(aim)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let frame = 0
    let last = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      if (!visible) return
      const now = clock.getElapsedTime()
      const dt = Math.min(1 / 30, now - last)
      last = now

      let intensity = reduceMotion ? 0 : 0.35
      if (show) {
        const t = now - show.start
        if (t < MIX_S) {
          intensity = reduceMotion ? 0 : 1.8
        } else if (t < MIX_S + RISE_S) {
          // Lift the winner to the exit at the top of the globe
          if (!show.from.lengthSq()) show.from.copy(show.ball.mesh.position)
          const p = ease((t - MIX_S) / RISE_S)
          show.ball.mesh.position.lerpVectors(show.from, tube.getPoint(0), p)
          intensity = 0.8
        } else if (t < MIX_S + RISE_S + TUBE_S) {
          const p = ease((t - MIX_S - RISE_S) / TUBE_S)
          show.ball.mesh.position.copy(tube.getPoint(p))
          show.ball.mesh.rotation.z -= dt * 9
          intensity = 0.5
        } else if (t < MIX_S + RISE_S + TUBE_S + DROP_S) {
          const p = (t - MIX_S - RISE_S - TUBE_S) / DROP_S
          const end = tube.getPoint(1)
          // Fall with a little bounce at the bottom
          const fall = p < 0.75 ? Math.pow(p / 0.75, 2) : 1 - Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.08
          show.ball.mesh.position.lerpVectors(end, PEDESTAL_AT, fall)
          show.ball.mesh.scale.setScalar(1 + (PEDESTAL_SCALE - 1) * Math.min(1, p * 1.3))
        } else {
          // Landed: off the balls in the globe, onto the pedestal
          const done = show
          show = null
          balls = balls.filter((b) => b !== done.ball)
          if (pedestal) dropBall(pedestal)
          pedestal = done.ball
          pedestal.mesh.position.copy(PEDESTAL_AT)
          pedestal.mesh.scale.setScalar(PEDESTAL_SCALE)
          spot.intensity = 1.2
          // Still in the draw (under the win cap)? A fresh ball goes back in the globe
          if (lastNames.slice(0, MAX_BALLS).includes(done.name)) balls.push(makeBall(done.name))
          setWinner({ key: done.key, name: done.name, shown: true })
          onDrawnRef.current?.(done.key)
        }
      }
      // The pedestal ball turns slowly so its name passes the camera
      if (pedestal) pedestal.mesh.rotation.y += dt * 0.8

      const spinRate = reduceMotion ? 0 : intensity * 2.2
      for (const p of paddles) p.rotation.y += spinRate * dt
      step(dt, intensity, now)

      renderer.render(scene, camera)
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
      balls.forEach(dropBall)
      if (pedestal) dropBall(pedestal)
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [tight])

  // Keep the balls in step with the entries
  const namesKey = names.slice(0, MAX_BALLS).join('\u0000')
  useEffect(() => {
    if (status === 'ready') api.current?.setNames(names)
  }, [namesKey, status])

  // Latest winner at rest on the pedestal (no animation)
  useEffect(() => {
    if (status === 'ready' && !draw) api.current?.rest(resting)
    if (!draw) setWinner(resting ? { key: 'rest', name: resting, shown: true } : null)
  }, [resting, status, draw])

  // A new draw plays once
  useEffect(() => {
    if (status !== 'ready' || !draw || draw.key === seenDraw.current) return
    seenDraw.current = draw.key
    api.current?.play(draw)
  }, [draw, status])

  const closeInspect = useCallback(() => setInspect(null), [])

  return (
    <div className={`raffle-machine raffle-machine--${status}`}>
      <div className="raffle-machine__stage" ref={hostRef} />
      {status === 'loading' && <span className="raffle-machine__loading" aria-hidden />}
      {status === 'unsupported' && <span className="raffle-machine__fallback">3D view unavailable</span>}
      {winner?.shown && (
        <div className="raffle-machine__winner" key={winner.key} role="status">
          <span className="raffle-machine__winner-label">Winner</span>
          <span className="raffle-machine__winner-name">{winner.name}</span>
        </div>
      )}
      {inspect && <BallViewer name={inspect.name} colorIndex={inspect.colorIndex} onClose={closeInspect} />}
    </div>
  )
}
