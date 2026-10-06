import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ballMaterial, ballTexture, studioEnvironment } from './studio'

/**
 * One name ball up close, over the machine: drag to turn it, scroll or pinch
 * to zoom. It turns slowly on its own until it is touched.
 */
export default function BallViewer({ name, colorIndex, onClose }: { name: string; colorIndex: number; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = studioEnvironment()
    const env = pmrem.fromScene(studio, 0.02).texture
    studio.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
    scene.environment = env
    const key = new THREE.DirectionalLight(0xfff3e2, 2)
    key.position.set(3, 4, 5)
    const rim = new THREE.DirectionalLight(0x6f9bff, 1.4)
    rim.position.set(-3, 2, -4)
    scene.add(key, rim)

    const map = ballTexture(name, colorIndex, renderer.capabilities.getMaxAnisotropy(), 150)
    const material = ballMaterial(map)
    const geometry = new THREE.SphereGeometry(1, 96, 64)
    // The name sits a quarter of the way round the texture, which faces +z: the camera
    scene.add(new THREE.Mesh(geometry, material))

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0.35, 4.6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.4
    controls.maxDistance = 7
    controls.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    controls.autoRotateSpeed = 1.6
    const stopSpin = () => {
      controls.autoRotate = false
    }
    controls.addEventListener('start', stopSpin)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let frame = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.removeEventListener('start', stopSpin)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      map.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [name, colorIndex])

  return (
    <div
      className="ball-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s ball`}
      // A click on the dimmed backdrop (not a drag on the ball) closes it
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="ball-viewer__stage" ref={hostRef} />
      <span className="ball-viewer__name">{name}</span>
      <span className="ball-viewer__hint">Drag to turn · scroll to zoom</span>
      <button ref={closeRef} type="button" className="ball-viewer__close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  )
}
