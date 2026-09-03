/**
 * Turns a product title into a description of the thing itself.
 *
 * The catalogue has 320 products but only ever had 28 stock photos, so images
 * repeated up to 17 times and a "Chef Knife" could show a mixing bowl. Rather
 * than source 320 photographs, every product is *drawn* from its own title: the
 * title names the object ("Chef Knife") and usually its material ("Oak", "Iron",
 * "Marble"), which is enough to build a recognisable model.
 *
 * The result feeds two renderers — an isometric SVG for cards and a Three.js
 * scene for the detail page — so a product's thumbnail and its 3D model are
 * always the same object. See productParts.js for the geometry itself.
 */

// Longest phrases first: "sling pack" must win over "pack", and "reading light"
// over "light". Matching is on the lower-cased title.
const KINDS = [
  // audio
  ['headphones', 'headphones'],
  ['earbuds', 'earbuds'],
  ['turntable', 'turntable'],
  ['amplifier', 'amplifier'],
  ['soundbar', 'soundbar'],
  ['microphone', 'microphone'],
  ['speaker', 'speaker'],
  // lighting
  ['desk lamp', 'deskLamp'],
  ['floor lamp', 'floorLamp'],
  ['wall sconce', 'sconce'],
  ['pendant light', 'pendant'],
  ['reading light', 'deskLamp'],
  ['lantern', 'lantern'],
  // workspace
  ['monitor arm', 'monitorArm'],
  ['laptop stand', 'laptopStand'],
  ['cable tray', 'cableTray'],
  ['desk mat', 'deskMat'],
  ['keyboard', 'keyboard'],
  ['footrest', 'footrest'],
  ['mouse', 'mouse'],
  // kitchen
  ['cutting board', 'cuttingBoard'],
  ['chef knife', 'knife'],
  ['mixing bowls', 'bowls'],
  ['mug set', 'mug'],
  ['french press', 'frenchPress'],
  ['pepper mill', 'pepperMill'],
  ['kettle', 'kettle'],
  // home
  ['throw blanket', 'blanket'],
  ['storage basket', 'basket'],
  ['cushion cover', 'cushion'],
  ['shelf', 'shelf'],
  ['vase', 'vase'],
  ['mirror', 'mirror'],
  ['rug', 'rug'],
  // bags
  ['sling pack', 'slingPack'],
  ['messenger bag', 'messenger'],
  ['laptop sleeve', 'sleeve'],
  ['weekender', 'weekender'],
  ['backpack', 'backpack'],
  ['tote', 'tote'],
  // fitness
  ['resistance bands', 'bands'],
  ['gym towel', 'towel'],
  ['yoga mat', 'yogaMat'],
  ['jump rope', 'jumpRope'],
  ['foam roller', 'roller'],
  ['kettlebell', 'kettlebell'],
  // stationery
  ['fountain pen', 'pen'],
  ['pencil set', 'pencils'],
  ['sketchbook', 'book'],
  ['notebook', 'book'],
  ['planner', 'book'],
  ['diary', 'book'],
  // outdoor
  ['dry bag', 'dryBag'],
  ['camp chair', 'campChair'],
  ['head torch', 'headTorch'],
  ['picnic blanket', 'blanket'],
  ['cool box', 'coolBox'],
  ['water bottle', 'bottle'],
  // accessories
  ['card holder', 'wallet'],
  ['key organiser', 'keyOrganiser'],
  ['watch strap', 'watchStrap'],
  ['sunglasses', 'sunglasses'],
  ['wallet', 'wallet'],
  ['belt', 'belt'],
]

/**
 * Material named in the title, when there is one. "Oak Vase" and "Marble Vase"
 * are different products and should not look identical, and the adjective is
 * the most reliable signal the catalogue gives us.
 */
const MATERIALS = {
  oak: { base: '#c8a06a', edge: '#a07c4c', name: 'oak' },
  walnut: { base: '#6f4b32', edge: '#523524', name: 'walnut' },
  marble: { base: '#ece7e0', edge: '#c9c1b6', name: 'marble' },
  iron: { base: '#3d3f42', edge: '#26282a', name: 'iron' },
  titanium: { base: '#9aa0a6', edge: '#71777d', name: 'titanium' },
  steel: { base: '#b6bcc2', edge: '#8b9197', name: 'steel' },
  glass: { base: '#d8e5e6', edge: '#aebfc2', name: 'glass' },
  cork: { base: '#c9a271', edge: '#a17f52', name: 'cork' },
  leather: { base: '#8a5a3c', edge: '#67412b', name: 'leather' },
  canvas: { base: '#cbbfa8', edge: '#a89b83', name: 'canvas' },
  linen: { base: '#e2d9c8', edge: '#bfb4a0', name: 'linen' },
  woven: { base: '#c2ad8c', edge: '#9c8869', name: 'woven' },
}

// Colourways for products whose title names no material. Drawn from the design
// tokens so generated goods read as part of the marketplace.
const COLOURWAYS = [
  { base: '#cc785c', edge: '#a15840', name: 'coral' },
  { base: '#2f3336', edge: '#1c1f21', name: 'graphite' },
  { base: '#d9cfc0', edge: '#b3a693', name: 'sand' },
  { base: '#4a6670', edge: '#334a52', name: 'slate' },
  { base: '#efe9de', edge: '#c8c0b2', name: 'bone' },
  { base: '#7d6552', edge: '#5b483a', name: 'clay' },
]

/**
 * Stable 32-bit hash — the same product always produces the same model.
 *
 * The accumulate loop alone is not enough. `value * 31 + char` means two keys of
 * equal length differing only in their last character produce hashes one apart,
 * so all the change lands in the low bits. Every seeded proportion is read from
 * a different *high* byte, which left sequential keys ("id-1", "id-2") sharing
 * an identical model. The finaliser below (MurmurHash3's) avalanches a one-bit
 * input change across the whole word, so neighbouring ids look unrelated.
 */
export function hashOf(text) {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0
  }
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35)
  value ^= value >>> 16
  return Math.abs(value)
}

export function kindOf(title = '') {
  const text = String(title).toLowerCase()
  for (const [needle, kind] of KINDS) if (text.includes(needle)) return kind
  return 'box'
}

function materialOf(title, seed) {
  const text = String(title).toLowerCase()
  for (const [needle, material] of Object.entries(MATERIALS)) {
    if (text.includes(needle)) return material
  }
  return COLOURWAYS[seed % COLOURWAYS.length]
}

/**
 * Everything the renderers need: which object to build, what it is made of, and
 * a few seeded numbers so two products of the same kind differ in proportion.
 *
 * The object and its material are read from the *title*, but the proportions are
 * seeded from `key` — pass the slug. The catalogue contains repeated titles, so
 * seeding from the title alone gave 14 pairs of products an identical model;
 * slugs are unique, which is what makes every product's artwork its own.
 */
export function modelFor(title = 'Product', key = title) {
  const seed = hashOf(String(key))
  const material = materialOf(title, hashOf(String(title)))
  // Three independent 0..1 values pulled from different bits of the hash, so
  // proportions vary without correlating with the colourway.
  const vary = (shift, spread) => (((seed >> shift) & 0xff) / 255 - 0.5) * spread
  return {
    kind: kindOf(title),
    material,
    accent: '#cc785c',
    seed,
    scale: 1 + vary(3, 0.22),
    stretch: 1 + vary(11, 0.3),
    // The angle the object is presented at, roughly ±34°. Wide enough that two
    // products sharing a title and a material are visibly different objects on
    // a shelf, narrow enough that nothing ends up facing away from the viewer.
    tilt: vary(19, 1.2),
  }
}
