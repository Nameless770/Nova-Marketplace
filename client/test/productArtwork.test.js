import { describe, expect, it } from 'vitest'
import { productArtwork } from '../src/lib/productArtwork.js'
import { kindOf, modelFor } from '../src/lib/productModel.js'
import { partsFor } from '../src/lib/productParts.js'

// Titles taken from the real catalogue, one per category, so the classifier is
// tested against the vocabulary it actually has to cope with.
const CATALOGUE = [
  'Marlow Compact Headphones',
  'Nova Adjustable Reading Light',
  'Harbour Leather-Trimmed Messenger Bag',
  'Studio Oak Cutting Board',
  'Northbound Iron Kettle',
  'Nova Marble Vase',
  'Harbour Cork Kettlebell',
  'Studio Layflat Sketchbook',
  'Northbound Camp Chair',
  'Nova Leather Sunglasses',
  'Marlow Low-Profile Keyboard',
  'Harbour Walnut Pepper Mill',
]

const fallbackParts = () =>
  JSON.stringify(partsFor({ ...modelFor('Totally Unknown Object'), kind: '__no_such_kind__' }))

describe('product kind classification', () => {
  it.each(CATALOGUE)('resolves %s to a modelled object rather than the generic box', (title) => {
    // `box` is the fallback. A real catalogue title reaching it is the bug the
    // shopper sees as "the picture is of the wrong thing".
    expect(kindOf(title)).not.toBe('box')
  })

  it('builds real geometry for every kind it can name', () => {
    for (const title of CATALOGUE) {
      const parts = partsFor(modelFor(title))
      expect(parts.length).toBeGreaterThan(0)
      // Not silently the fallback shape.
      expect(JSON.stringify(parts)).not.toBe(fallbackParts())
    }
  })

  it('reads the material out of the title, so Oak and Marble differ', () => {
    const oak = modelFor('Studio Oak Vase', 'a')
    const marble = modelFor('Studio Marble Vase', 'a')
    expect(oak.kind).toBe(marble.kind)
    expect(oak.material.name).toBe('oak')
    expect(marble.material.name).toBe('marble')
    expect(oak.material.base).not.toBe(marble.material.base)
  })
})

describe('artwork', () => {
  it('is a self-contained SVG data URI, so it cannot hang or 404', () => {
    const art = productArtwork('Marlow Compact Headphones', 'seed-1')
    expect(art.startsWith('data:image/svg+xml,')).toBe(true)
    const svg = decodeURIComponent(art.slice('data:image/svg+xml,'.length))
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 400 400"/)
    expect(svg.endsWith('</svg>')).toBe(true)
    // Nothing is fetched: no nested <image>, no url() reference. The xmlns is a
    // namespace identifier, not a request, so it is not what this is guarding.
    expect(svg).not.toMatch(/<image/)
    expect(svg).not.toMatch(/url\(/)
    expect(svg.replace(/xmlns="[^"]*"/g, '')).not.toMatch(/https?:/)
  })

  it('is stable for one product and different for another', () => {
    const first = productArtwork('Marlow Compact Headphones', 'product-a')
    expect(productArtwork('Marlow Compact Headphones', 'product-a')).toBe(first)
    // Same title, different product: the catalogue repeats titles, so the seed
    // is what stops two rows sharing one picture.
    expect(productArtwork('Marlow Compact Headphones', 'product-b')).not.toBe(first)
  })

  it('gives every product in a batch its own artwork', () => {
    const seeds = Array.from({ length: 200 }, (_, index) => `id-${index}`)
    const art = new Set(seeds.map((seed) => productArtwork('Harbour Canvas Tote', seed)))
    expect(art.size).toBe(seeds.length)
  })

  it('honours part rotation', () => {
    // The SVG renderer originally ignored `rot` while three.js applied it, so a
    // card and its 3D model disagreed: headphone cups lay flat instead of facing
    // outwards, and sunglasses came out as a dumbbell.
    //
    // Headphones are the case that caught it — their cups are cylinders turned
    // 90°. Both ear cups sit at the same height and mirror each other in x, so
    // if rotation were dropped the drawing would be symmetric about the centre
    // line; with rotation applied the projected caps are not.
    const svg = decodeURIComponent(productArtwork('Marlow Compact Headphones', 's').split(',')[1])
    const rotations = svg.match(/transform="rotate\(/g) ?? []
    expect(rotations.length).toBeGreaterThan(0)
  })

  it('keeps the drawing inside the frame', () => {
    for (const title of CATALOGUE) {
      const svg = decodeURIComponent(productArtwork(title, title).split(',')[1])
      const fit = svg.match(/scale\(([\d.]+)\)/)
      expect(fit).not.toBeNull()
      // Auto-fit must produce a sane, finite zoom — a degenerate bounding box
      // would blow the object up to nothing or to a smear.
      expect(Number(fit[1])).toBeGreaterThan(0)
      expect(Number(fit[1])).toBeLessThan(20)
    }
  })
})
