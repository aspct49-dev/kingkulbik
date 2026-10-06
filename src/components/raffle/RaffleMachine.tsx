import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
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

/** Ball colours: the site's gold, white and blue */
const BALL_COLORS = [
  { base: '#f2c21b', band: '#ffffff', text: '#151b25' },
  { base: '#f4f6fb', band: '#151b25', text: '#ffffff' },
  { base: '#2f6fd6', band: '#ffffff', text: '#151b25' },
]

function ballTexture(name: string, colorIndex: number) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const col = BALL_COLORS[colorIndex % BALL_COLORS.length]
  g.fillStyle = col.base
  g.fillRect(0, 0, 512, 256)
  // A band round the middle carries the name (equirectangular: it wraps the ball)
  g.fillStyle = col.band
  g.fillRect(0, 86, 512, 84)
  g.fillStyle = col.text
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = 54
  g.font = `800 ${size}px Onest, system-ui, sans-serif`
  while (g.measureText(name).width > 230 && size > 22) {
    size -= 2
    g.font = `800 ${size}px Onest, system-ui, sans-serif`
  }
  // Twice round the band, so a name always faces out
  g.fillText(name, 128, 129)
  g.fillText(name, 384, 129)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

type Ball = {
  name: string
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
    renderer.toneMappingExposure = 1.1
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(3, 5, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x5b8dff, 1.4)
    rim.position.set(-4, 2, -3)
    scene.add(rim)
    // A warm glow on the pedestal
    const spot = new THREE.PointLight(0xffd36b, 0, 3)
    spot.position.set(TARGET.x, TARGET.y + 0.9, TARGET.z + 0.6)
    scene.add(spot)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
    const look = new THREE.Vector3(1.03, 1.95, 0.35)

    const tube = new THREE.CatmullRomCurve3(TUBE_POINTS.map((p) => new THREE.Vector3(...p)))
    const ballGeometry = new THREE.SphereGeometry(BALL_R, 28, 20)
    const disposables: { dispose: () => void }[] = [envTexture, pmrem, ballGeometry]
    const machine = new THREE.Group()
    scene.add(machine)
    const paddles: THREE.Object3D[] = []

    let balls: Ball[] = []
    let colorCursor = 0
    const makeBall = (name: string, at?: THREE.Vector3): Ball => {
      const map = ballTexture(name, colorCursor++)
      const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 })
      const mesh = new THREE.Mesh(ballGeometry, mat)
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
      return { name, mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(2) }
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
          const mat = mesh.material as THREE.MeshStandardMaterial
          // The acrylic as clear glass: balls stay visible inside the globe and tube
          if (mat.name === 'KK_Acrylic') {
            const glass = new THREE.MeshPhysicalMaterial({
              color: 0xcfe0ff,
              metalness: 0,
              roughness: 0.04,
              transparent: true,
              opacity: 0.13,
              clearcoat: 1,
              clearcoatRoughness: 0.03,
              envMapIntensity: 1.2,
              depthWrite: false,
            })
            mesh.material = glass
            mesh.renderOrder = 2
            disposables.push(glass)
          }
          disposables.push(mesh.geometry)
          disposables.push(mesh.material as THREE.Material)
        })
        setStatus('ready')
      })
      .catch(() => setStatus('unsupported'))

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
      // Fit the whole machine (about 4.5 wide, 4 tall) at any aspect
      const fit = Math.max(4.6 / (w / h), 4.3) * (tight ? 0.92 : 1)
      const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      camera.position.set(look.x + 0.6, look.y + 0.55, look.z + dist)
      camera.lookAt(look)
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
    </div>
  )
}
