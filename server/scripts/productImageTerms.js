/**
 * What each product actually is, and the phrase that finds a photo of it.
 *
 * The key is matched against the lower-cased product title, longest phrase
 * first, so "sling pack" wins over "pack" and "reading light" over "light". The
 * value is the search query, which is sometimes different: Commons files a
 * turntable under "record player" and a head torch under "headlamp".
 *
 * Deliberately finer-grained than the client's 3D-model classifier. That one
 * groups notebooks, planners and sketchbooks into a single shape because they
 * look alike; here they are separate, because a photo search can tell them apart
 * and a shopper can see the difference.
 */
export const SEARCH_TERMS = [
  // audio
  ['headphones', 'headphones'],
  ['earbuds', 'earbud headphones'],
  ['turntable', 'record player turntable'],
  ['amplifier', 'audio amplifier'],
  ['soundbar', 'soundbar loudspeaker'],
  ['microphone', 'microphone'],
  ['speaker', 'loudspeaker'],
  // lighting
  ['desk lamp', 'desk lamp'],
  ['floor lamp', 'floor lamp'],
  ['wall sconce', 'wall sconce lamp'],
  ['pendant light', 'pendant lamp'],
  ['reading light', 'reading lamp'],
  ['lantern', 'lantern'],
  // workspace
  ['monitor arm', 'computer monitor'],
  ['laptop stand', 'laptop computer stand'],
  ['cable tray', 'cable tray'],
  ['desk mat', 'desk pad'],
  ['keyboard', 'computer keyboard'],
  ['footrest', 'footstool'],
  ['mouse', 'computer mouse'],
  // kitchen
  ['cutting board', 'cutting board'],
  ['chef knife', 'chef knife'],
  ['mixing bowls', 'mixing bowl'],
  ['mug set', 'coffee mug'],
  ['french press', 'french press coffee'],
  ['pepper mill', 'pepper grinder'],
  ['kettle', 'kettle'],
  // home
  ['throw blanket', 'blanket'],
  ['storage basket', 'wicker basket'],
  ['cushion cover', 'cushion pillow'],
  ['shelf', 'bookshelf'],
  ['vase', 'vase'],
  ['mirror', 'wall mirror'],
  ['rug', 'carpet rug'],
  // bags
  ['sling pack', 'shoulder bag'],
  ['messenger bag', 'messenger bag'],
  ['laptop sleeve', 'laptop bag'],
  ['weekender', 'duffel bag'],
  ['backpack', 'backpack'],
  ['tote', 'tote bag'],
  // fitness
  ['resistance bands', 'resistance band exercise'],
  ['gym towel', 'towel'],
  ['yoga mat', 'yoga mat'],
  ['jump rope', 'skipping rope'],
  ['foam roller', 'foam roller exercise'],
  ['kettlebell', 'kettlebell'],
  // stationery
  ['fountain pen', 'fountain pen'],
  ['pencil set', 'pencil'],
  ['sketchbook', 'sketchbook'],
  ['notebook', 'notebook paper'],
  ['planner', 'diary planner'],
  ['diary', 'diary book'],
  // outdoor
  ['dry bag', 'dry bag'],
  ['camp chair', 'folding chair'],
  ['head torch', 'headlamp'],
  ['picnic blanket', 'picnic blanket'],
  ['cool box', 'cooler box'],
  ['water bottle', 'water bottle'],
  // accessories
  ['card holder', 'card holder wallet'],
  ['key organiser', 'keychain'],
  ['watch strap', 'watch strap'],
  ['sunglasses', 'sunglasses'],
  ['wallet', 'wallet'],
  ['belt', 'leather belt'],
]

/** Falls back to the category when a title names nothing we search for. */
export const CATEGORY_TERMS = {
  audio: 'audio equipment',
  lighting: 'lamp',
  workspace: 'desk',
  kitchen: 'kitchenware',
  home: 'home decor',
  bags: 'bag',
  fitness: 'exercise equipment',
  stationery: 'stationery',
  outdoor: 'camping equipment',
  accessories: 'fashion accessory',
}

/** The pool key for a product, from its title — category only as a backstop. */
export function poolKeyFor(title = '', categorySlug = '') {
  const text = String(title).toLowerCase()
  for (const [key] of SEARCH_TERMS) if (text.includes(key)) return key
  return `category:${categorySlug}`
}
