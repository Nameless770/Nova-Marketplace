// Real product photos per category, so a headphone product shows headphones and
// a lamp shows a lamp. Each ID is an Unsplash photo verified to load and to
// depict the right product type. picsum.photos (the old source) both hangs in
// some networks and shows unrelated random images, so it was replaced.
//
// images.unsplash.com serves a resized/cropped JPEG straight from the photo ID
// with no API key. Pools have a few options each so products in one category
// are not all identical.
const POOLS = {
  audio: ['1505740420928-5e560c06d30e', '1546435770-a3e426bf472b', '1583394838336-acd977736f90'],
  lighting: [
    '1513506003901-1e6a229e2d15',
    '1517991104123-1d56a6e81ed9',
    '1524484485831-a92ffc0de03f',
  ],
  workspace: [
    '1497215728101-856f4ea42174',
    '1593642702821-c8da6771f0c6',
    '1587829741301-dc798b83add3',
  ],
  home: ['1586023492125-27b2c045efd7', '1555041469-a586c61ea9bc', '1567016432779-094069958ea5'],
  kitchen: ['1544787219-7f47ccb76574', '1585515320310-259814833e62', '1517668808822-9ebb02f2a0e6'],
  outdoor: ['1551632811-561732d1e306', '1622260614153-03223fb72052'],
  fitness: [
    '1571019613454-1cb2f99b2d8b',
    '1518611012118-696072aa579a',
    '1517836357463-d25dfeac3438',
  ],
  stationery: ['1517842645767-c639042777db', '1531346878377-a5be20888e57'],
  bags: ['1553062407-98eeb64c6a62', '1548036328-c9fa89d128fa', '1591561954557-26941169b49e'],
  accessories: [
    '1524592094714-0f0654e20314',
    '1523275335684-37898b6baf30',
    '1511499767150-a48a237f0083',
  ],
}

// Any category without its own pool falls back to a neutral product photo.
const FALLBACK = ['1553062407-98eeb64c6a62']

function unsplashUrl(id) {
  return `https://images.unsplash.com/photo-${id}?w=800&h=800&fit=crop&q=70&auto=format`
}

// Deterministic index from a string, so a given product always maps to the same
// photo (stable across re-seeds) while spreading a category across its pool.
function pickIndex(key, length) {
  let value = 0
  for (let i = 0; i < key.length; i += 1) value = (value * 31 + key.charCodeAt(i)) | 0
  return Math.abs(value) % length
}

// `key` is anything stable per product (its slug works well).
export function imageForCategory(categorySlug, key = '') {
  const pool = POOLS[categorySlug] || FALLBACK
  return unsplashUrl(pool[pickIndex(String(key), pool.length)])
}
