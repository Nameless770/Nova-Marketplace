import { modelFor } from './productModel.js'
import { partsFor } from './productParts.js'

/**
 * Draws a product's primitives as an isometric SVG data URI.
 *
 * Cards need artwork for a whole grid at once, and a WebGL context per card is
 * not an option — browsers cap them at roughly sixteen. So the card gets a
 * projected vector drawing of the *same* primitives the 3D viewer builds, which
 * keeps the thumbnail and the model recognisably one object while costing
 * nothing but string concatenation.
 *
 * Part rotations are applied here for that reason. Skipping them is tempting —
 * most parts are axis-aligned — but three.js honours them, so an unrotated SVG
 * would quietly disagree with the model it is supposed to preview: headphone
 * cups sat flat instead of facing outwards.
 */

const SIZE = 400
const ISO = Math.PI / 6 // 30°, the classic isometric angle

// Sub-pixel precision is invisible at card size but triples the length of every
// data URI, and a 24-card grid inlines all of them into the DOM at once.
const round = (value) => Math.round(value * 10) / 10

/** Project a 3D point to 2D. x and z fan out sideways; y is straight up. */
function project([x, y, z], zoom) {
  return [
    round(SIZE / 2 + (x - z) * Math.cos(ISO) * zoom),
    round(SIZE / 2 + 12 - (y - (x + z) * Math.sin(ISO) * 0.5) * zoom),
  ]
}

/**
 * Depth along the view direction. The camera looks down (1, 1, 1), so a larger
 * sum is nearer — used to order both parts and the faces within a part.
 */
const depth = ([x, y, z]) => x + y + z

/**
 * Euler rotation in three.js's default XYZ order, which composes as Rx·Ry·Rz —
 * so a vector meets Z first. Matching the order matters: the two renderers would
 * otherwise place the same part differently.
 */
function rotate([x, y, z], [rx, ry, rz]) {
  let cos = Math.cos(rz)
  let sin = Math.sin(rz)
  let nx = x * cos - y * sin
  let ny = x * sin + y * cos
  x = nx
  y = ny

  cos = Math.cos(ry)
  sin = Math.sin(ry)
  nx = x * cos + z * sin
  let nz = -x * sin + z * cos
  x = nx
  z = nz

  cos = Math.cos(rx)
  sin = Math.sin(rx)
  ny = y * cos - z * sin
  nz = y * sin + z * cos
  y = ny
  z = nz

  return [x, y, z]
}

/**
 * Spin about the vertical axis — the whole object's presentation angle.
 *
 * The 3D viewer applies this as `group.rotation.y`, so the SVG has to as well or
 * the card shows the object from a different side than the model does. It is
 * also what separates two products that share a title and a material: without
 * it their drawings collapsed onto each other.
 */
function rotateY([x, y, z], angle) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos + z * sin, y, -x * sin + z * cos]
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const length = (v) => Math.hypot(v[0], v[1], v[2]) || 1

function shade(hex, amount) {
  const value = hex.replace('#', '')
  if (value.length !== 6) return hex
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16)
    const shifted = amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount)
    return Math.max(0, Math.min(255, Math.round(shifted)))
  })
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// A single key light, so faces turned away from it read darker. Without this a
// rotated box is a flat silhouette and stops looking solid.
const LIGHT = [0.42, 0.86, 0.3]
function litShade(normal) {
  const n = length(normal)
  const dot = (normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]) / n
  return -0.2 + 0.34 * Math.max(0, dot)
}

/**
 * How square-on a circular face is to the camera, 0 (edge-on) to 1 (facing it).
 *
 * This has to be measured against the view direction, not world "up": a lens
 * rotated to point at the viewer is a full circle, and judging it by its Y
 * component instead flattened it to a rod — sunglasses came out as a dumbbell.
 */
function facing(axis) {
  return Math.min(1, Math.abs(depth(axis)) / (length(axis) * Math.sqrt(3)))
}

/** Ellipse ry for a circular face of radius `radius` at that angle. */
const capHeight = (radius, axis) => Math.max(1, radius * (0.12 + 0.72 * facing(axis)))

/** A direction in the piece's own space, taken into world space. */
const toWorld = (local, piece, tilt) => rotateY(rotate(local, piece.rot), tilt)

/** The piece's centre in world space. */
const centreOf = (piece, tilt) => rotateY(piece.pos, tilt)

/** World-space corner of a piece, honouring both its rotation and the tilt. */
function corner(piece, signs, tilt) {
  const [w, h, d] = piece.size
  const local = [(signs[0] * w) / 2, (signs[1] * h) / 2, (signs[2] * d) / 2]
  return add(centreOf(piece, tilt), toWorld(local, piece, tilt))
}

const FACES = [
  [
    [1, 1, -1],
    [1, 1, 1],
    [1, -1, 1],
    [1, -1, -1],
  ],
  [
    [-1, 1, 1],
    [-1, 1, -1],
    [-1, -1, -1],
    [-1, -1, 1],
  ],
  [
    [-1, 1, 1],
    [1, 1, 1],
    [1, 1, -1],
    [-1, 1, -1],
  ],
  [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
  ],
  [
    [-1, 1, 1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, -1],
    [1, -1, -1],
    [-1, -1, -1],
    [-1, 1, -1],
  ],
]

/**
 * A rotated box, drawn face by face. Every face is emitted back-to-front rather
 * than picking "the three an isometric camera sees", because which three those
 * are changes once a part is rotated.
 */
function box(piece, zoom, tilt) {
  const faces = FACES.map((signs) => {
    const points = signs.map((sign) => corner(piece, sign, tilt))
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
    const centre = points.reduce((acc, p) => add(acc, p), [0, 0, 0]).map((value) => value / 4)
    return { points, normal, order: depth(centre) }
  })
  faces.sort((a, b) => a.order - b.order)
  return faces
    .map(
      (face) =>
        `<polygon points="${face.points.map((p) => project(p, zoom).join(',')).join(' ')}" ` +
        `fill="${shade(piece.color, litShade(face.normal))}"/>`,
    )
    .join('')
}

/**
 * A cylinder as an oriented capsule: both end caps projected as ellipses, joined
 * by a quad. Approximate, but it keeps the axis pointing where the 3D mesh
 * points, which is the part that carries meaning.
 */
function cylinder(piece, zoom, tilt) {
  const [rTop, rBottom, h] = piece.size
  const axis = toWorld([0, h / 2, 0], piece, tilt)
  const centre = centreOf(piece, tilt)
  const top = add(centre, axis)
  const bottom = sub(centre, axis)
  const [tx, ty] = project(top, zoom)
  const [bx, by] = project(bottom, zoom)

  // Perpendicular to the projected axis, so the body has the right width.
  const dx = tx - bx
  const dy = ty - by
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const rT = rTop * zoom * 0.87
  const rB = rBottom * zoom * 0.87

  const quad = [
    [tx + px * rT, ty + py * rT],
    [bx + px * rB, by + py * rB],
    [bx - px * rB, by - py * rB],
    [tx - px * rT, ty - py * rT],
  ]
  const capRy = capHeight(rT, axis)
  const capAngle = round((Math.atan2(dy, dx) * 180) / Math.PI + 90)

  return (
    `<polygon points="${quad.map((p) => `${round(p[0])},${round(p[1])}`).join(' ')}" fill="${piece.color}"/>` +
    `<ellipse cx="${bx}" cy="${by}" rx="${round(rB)}" ry="${round(capRy)}" ` +
    `transform="rotate(${capAngle} ${bx} ${by})" fill="${shade(piece.color, -0.16)}"/>` +
    `<ellipse cx="${tx}" cy="${ty}" rx="${round(rT)}" ry="${round(capRy)}" ` +
    `transform="rotate(${capAngle} ${tx} ${ty})" fill="${shade(piece.color, 0.17)}"/>`
  )
}

function sphere(piece, zoom, tilt) {
  const [r] = piece.size
  const [cx, cy] = project(centreOf(piece, tilt), zoom)
  const radius = round(r * zoom * 0.87)
  return (
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${piece.color}"/>` +
    `<circle cx="${round(cx - radius * 0.28)}" cy="${round(cy - radius * 0.3)}" ` +
    `r="${round(radius * 0.55)}" fill="${shade(piece.color, 0.17)}" opacity="0.7"/>`
  )
}

function cone(piece, zoom, tilt) {
  const [r, h] = piece.size
  const axis = toWorld([0, h / 2, 0], piece, tilt)
  const centre = centreOf(piece, tilt)
  const apex = add(centre, axis)
  const base = sub(centre, axis)
  const [ax, ay] = project(apex, zoom)
  const [bx, by] = project(base, zoom)
  const dx = ax - bx
  const dy = ay - by
  const len = Math.hypot(dx, dy) || 1
  const px = (-dy / len) * r * zoom * 0.87
  const py = (dx / len) * r * zoom * 0.87
  const capRy = capHeight(r * zoom * 0.87, axis)
  const capAngle = round((Math.atan2(dy, dx) * 180) / Math.PI + 90)
  return (
    `<ellipse cx="${bx}" cy="${by}" rx="${round(r * zoom * 0.87)}" ry="${round(capRy)}" ` +
    `transform="rotate(${capAngle} ${bx} ${by})" fill="${shade(piece.color, -0.16)}"/>` +
    `<polygon points="${round(bx + px)},${round(by + py)} ${ax},${ay} ${round(bx - px)},${round(by - py)}" fill="${piece.color}"/>`
  )
}

/**
 * A torus seen edge-on becomes a line and face-on a circle, so the ring is drawn
 * as an ellipse squashed by how far its axis leans away from the camera.
 */
function torus(piece, zoom, tilt) {
  const [r, tube] = piece.size
  const centre = centreOf(piece, tilt)
  const [cx, cy] = project(centre, zoom)
  const axis = toWorld([0, 1, 0], piece, tilt)
  const radius = round(r * zoom * 0.87)
  // The ring's plane is perpendicular to its axis: an axis pointing at the
  // camera opens the ring, one across the view closes it.
  const ry = Math.max(1.5, radius * (0.22 + 0.72 * facing(axis)))
  const flat = project(add(centre, toWorld([r, 0, 0], piece, tilt)), zoom)
  const ringAngle = round((Math.atan2(flat[1] - cy, flat[0] - cx) * 180) / Math.PI)
  return (
    `<ellipse cx="${cx}" cy="${cy}" rx="${radius}" ry="${round(ry)}" ` +
    `transform="rotate(${ringAngle} ${cx} ${cy})" fill="none" ` +
    `stroke="${piece.color}" stroke-width="${round(Math.max(1.5, tube * zoom * 1.7))}"/>`
  )
}

const RENDERERS = { box, cyl: cylinder, sphere, cone, torus }

/** How far a piece reaches from its centre; generous, since cropping is worse. */
function reachOf(piece) {
  return Math.max(...piece.size) * 0.8
}

function boundsOf(pieces, zoom, tilt) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const piece of pieces) {
    const [cx, cy] = project(centreOf(piece, tilt), zoom)
    const reach = reachOf(piece) * zoom
    minX = Math.min(minX, cx - reach)
    maxX = Math.max(maxX, cx + reach)
    minY = Math.min(minY, cy - reach)
    maxY = Math.max(maxY, cy + reach)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * @param title  drives which object is drawn
 * @param key    the product id — makes proportions unique per product
 */
export function productArtwork(title = 'Product', key = title) {
  const model = modelFor(title, key)
  const tilt = model.tilt
  const pieces = partsFor(model)
    .slice()
    .sort((a, b) => depth(centreOf(a, tilt)) - depth(centreOf(b, tilt)))
  const zoom = 108
  const body = pieces.map((piece) => (RENDERERS[piece.shape] ?? box)(piece, zoom, tilt)).join('')

  // Objects differ hugely in size — a watch strap next to a soundbar — so each
  // is fitted to the frame rather than drawn at a fixed zoom. Without this a
  // grid mixes postage stamps with things that overflow their tile.
  const { minX, maxX, minY, maxY } = boundsOf(pieces, zoom, tilt)
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const fit = round((SIZE * 0.68) / Math.max(width, height))
  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2
  // SVG applies a transform list right to left: scale first, then translate.
  const tx = round(SIZE / 2 - fit * centreX)
  const ty = round(SIZE * 0.47 - fit * centreY)

  // The shadow lives inside the fitted group and sits at the object's own base,
  // so it reads as contact with a surface instead of a disc floating below.
  const shadow =
    `<ellipse cx="${round(centreX)}" cy="${round(maxY)}" rx="${round(width * 0.4)}" ` +
    `ry="${round(Math.max(width, height) * 0.05)}" fill="#141413" opacity="0.15"/>`

  const backdrop = shade(model.material.base, 0.82)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${backdrop}"/>` +
    `<g transform="translate(${tx},${ty}) scale(${fit})">${shadow}${body}</g>` +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
