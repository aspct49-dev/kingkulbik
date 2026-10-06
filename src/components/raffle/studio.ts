import * as THREE from 'three'

/*
 * Shared by the raffle machine and the ball close-up: the name balls' look and
 * the studio the reflections come from.
 */

/** Ball colours: the site's gold, white and blue */
const BALL_COLORS = [
  { base: '#f2c21b', band: '#ffffff', text: '#151b25' },
  { base: '#f4f6fb', band: '#151b25', text: '#ffffff' },
  { base: '#2f6fd6', band: '#ffffff', text: '#151b25' },
]

/**
 * A name ball's print. `maxWidth` is how much of the half-band the name may
 * fill (out of 256): wide for the small balls in the machine, narrower up
 * close, where a wide name wraps out of sight round the sides.
 */
export function ballTexture(name: string, colorIndex: number, anisotropy: number, maxWidth = 230) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.scale(2, 2)
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
  while (g.measureText(name).width > maxWidth && size > 16) {
    size -= 2
    g.font = `800 ${size}px Onest, system-ui, sans-serif`
  }
  // Twice round the band, so a name always faces out
  g.fillText(name, 128, 129)
  g.fillText(name, 384, 129)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = anisotropy
  return t
}

/**
 * The reflection environment: a photo studio built in code, rendered to an HDR
 * cube by PMREM (so no HDRI download). A dark room with a big softbox high in
 * front, tall strip lights either side (the long edge highlights on the gold
 * rings and the glass), a warm card in front and a cool panel behind for the
 * rim. Colours above 1 are what make it HDR.
 */
export function studioEnvironment(): THREE.Scene {
  const env = new THREE.Scene()
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b1120, side: THREE.BackSide })))
  const panel = (w: number, h: number, color: number, strength: number, at: [number, number, number]) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }),
    )
    mesh.position.set(...at)
    mesh.lookAt(0, 2, 0)
    env.add(mesh)
  }
  panel(9, 5, 0xffffff, 3.2, [2.5, 10, 8]) // key softbox
  panel(1.4, 10, 0xffffff, 6, [-9, 3, 4]) // left strip
  panel(1.4, 10, 0xffffff, 4.5, [9, 3, 1]) // right strip
  panel(8, 3, 0xffe2b4, 1.2, [0, 0.5, 12]) // warm front card
  panel(8, 5, 0x6f9bff, 2.4, [-4, 5, -10]) // cool rim panel
  panel(14, 14, 0xffffff, 0.7, [0, 16, 0]) // ceiling
  return env
}

/** A name ball's surface: glossy lacquer over the printed colours */
export function ballMaterial(map: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 })
}
