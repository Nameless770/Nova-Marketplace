import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { modelFor } from '../lib/productModel.js'
import { partsFor } from '../lib/productParts.js'

/**
 * An interactive 3D model of a product, built from the same primitives that
 * draw its thumbnail — so the object you drag is the object you clicked.
 *
 * There is no model file to download: the geometry is generated from the
 * product's title and id, which is what makes a 3D view possible for all 320
 * products rather than the handful anyone could hand-model. It is a stylised
 * representation of the *kind* of thing being sold, not a scan of a real
 * product, and the caption says so rather than implying otherwise.
 *
 * Lazily imported by the details page: three.js is ~170 kB and no other route
 * needs it, so it must not land in the main bundle.
 */

const GEOMETRY = {
  box: ([w, h, d]) => new THREE.BoxGeometry(w, h, d),
  cyl: ([rTop, rBottom, h]) => new THREE.CylinderGeometry(rTop, rBottom, h, 48),
  sphere: ([r]) => new THREE.SphereGeometry(r, 40, 28),
  cone: ([r, h]) => new THREE.ConeGeometry(r, h, 44),
  torus: ([r, tube]) => new THREE.TorusGeometry(r, tube, 20, 64),
}

export function Product3DViewer({ title, seed, className }) {
  const mountRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // No WebGL (old browser, blocked, software rendering off). The details
      // page still has the flat artwork, so degrade instead of breaking.
      // Deferred to a microtask: setting state straight from an effect body
      // cascades renders, and this is the codebase's established way around it.
      Promise.resolve().then(() => setFailed(true))
      return undefined
    }

    const width = mount.clientWidth || 480
    const height = mount.clientHeight || 420
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(3.1, 2.3, 3.4)
    camera.lookAt(0, 0, 0)

    // Warm key light plus a cool fill, matching the cream canvas the rest of the
    // marketplace uses — a neutral studio setup would read as a different app.
    scene.add(new THREE.AmbientLight(0xffffff, 0.62))
    const key = new THREE.DirectionalLight(0xfff2e0, 2.1)
    key.position.set(4, 6, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 24
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xcfe0ea, 0.5)
    fill.position.set(-5, 2, -3)
    scene.add(fill)

    const model = modelFor(title || 'Product', String(seed ?? title ?? 'Product'))
    const group = new THREE.Group()
    const disposables = []

    for (const piece of partsFor(model)) {
      const make = GEOMETRY[piece.shape] ?? GEOMETRY.box
      const geometry = make(piece.size)
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(piece.color),
        roughness: 0.55,
        metalness: 0.12,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...piece.pos)
      mesh.rotation.set(...piece.rot)
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      disposables.push(geometry, material)
    }
    group.rotation.y = model.tilt
    scene.add(group)

    // A shadow-catching floor, invisible except for what falls on it, so the
    // object sits on a surface rather than floating in space.
    const floorGeometry = new THREE.PlaneGeometry(14, 14)
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.18 })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.15
    floor.receiveShadow = true
    scene.add(floor)
    disposables.push(floorGeometry, floorMaterial)

    // Drag to turn it. Deliberately hand-rolled rather than pulling in
    // OrbitControls: one axis of rotation is all this needs, and the addon
    // would add weight for pan/zoom nobody wants on a product shot.
    let dragging = false
    let lastX = 0
    let velocity = 0.0042
    const onDown = (event) => {
      dragging = true
      lastX = (event.touches ? event.touches[0] : event).clientX
    }
    const onMove = (event) => {
      if (!dragging) return
      const x = (event.touches ? event.touches[0] : event).clientX
      const delta = (x - lastX) * 0.01
      group.rotation.y += delta
      velocity = delta * 0.25
      lastX = x
    }
    const onUp = () => {
      dragging = false
    }

    const canvas = renderer.domElement
    canvas.style.touchAction = 'pan-y'
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      // Idles with a slow turn so the object reads as 3D before anyone touches
      // it; a drag takes over and its momentum decays back into the idle spin.
      if (!dragging) {
        group.rotation.y += velocity
        velocity += (0.0042 - velocity) * 0.04
      }
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      const w = mount.clientWidth || width
      const h = mount.clientHeight || height
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // WebGL contexts are a capped resource — a leak here would break the
      // viewer after a dozen product visits.
      for (const item of disposables) item.dispose()
      renderer.dispose()
      if (canvas.parentNode === mount) mount.removeChild(canvas)
    }
  }, [title, seed])

  if (failed) return null

  return (
    <div className={className}>
      <div ref={mountRef} className="viewer-3d-stage" />
      <p className="viewer-3d-hint">Drag to rotate · generated model</p>
    </div>
  )
}

export default Product3DViewer
