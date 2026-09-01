/**
 * Generates a large, coherent demo dataset.
 *
 * "Coherent" is the point: ratings are computed from the reviews that exist,
 * revenue comes from orders that reference real products, and dates are spread
 * across the last 90 days so charts, best-seller lists and recommendations have
 * something real to work with rather than a wall of identical rows.
 *
 *   npm run seed:large --prefix server
 *   npm run seed:large --prefix server -- --products=600 --orders=800
 *   npm run seed:large --prefix server -- --fresh
 *
 * Deterministic: the same flags always produce the same catalogue, so re-running
 * updates rather than multiplies.
 */
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env') })

const { connectDatabase, disconnectDatabase } = await import('../config/database.js')
const { imageForCategory } = await import('./productImages.js')

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}
const FRESH = process.argv.includes('--fresh')
const PRODUCT_COUNT = arg('products', 320)
const ORDER_COUNT = arg('orders', 420)
const CUSTOMER_COUNT = arg('customers', 60)
const REVIEW_COUNT = arg('reviews', 700)
const DAYS = 90

// Deterministic PRNG so a given set of flags always yields the same catalogue.
let seed = 0x2f6e2b1
const rand = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (min, max) => min + Math.floor(rand() * (max - min + 1))
const chance = (p) => rand() < p

const CATEGORIES = [
  { name: 'Audio', slug: 'audio' },
  { name: 'Lighting', slug: 'lighting' },
  { name: 'Workspace', slug: 'workspace' },
  { name: 'Home', slug: 'home' },
  { name: 'Kitchen', slug: 'kitchen' },
  { name: 'Outdoor', slug: 'outdoor' },
  { name: 'Fitness', slug: 'fitness' },
  { name: 'Stationery', slug: 'stationery' },
  { name: 'Bags', slug: 'bags' },
  { name: 'Accessories', slug: 'accessories' },
]

// Per-category vocabulary. Descriptions carry the words a shopper would actually
// type, so text search and the AI criteria extraction have real signal.
const VOCAB = {
  audio: {
    nouns: ['Headphones', 'Earbuds', 'Speaker', 'Turntable', 'Soundbar', 'Microphone', 'Amplifier'],
    adjectives: ['Wireless', 'Studio', 'Portable', 'Reference', 'Compact', 'Open-Back'],
    features: [
      '40 hour battery life',
      'active noise cancelling',
      'Bluetooth 5.3',
      'USB-C fast charging',
      'balanced armature drivers',
      'a detachable braided cable',
    ],
    price: [2500, 45000],
  },
  lighting: {
    nouns: ['Desk Lamp', 'Floor Lamp', 'Pendant Light', 'Wall Sconce', 'Reading Light', 'Lantern'],
    adjectives: ['Dimmable', 'Warm', 'Adjustable', 'Brass', 'Linen', 'Folding'],
    features: [
      'three brightness levels',
      'a weighted base',
      'low-glare diffusion',
      'a 2700K warm bulb',
      'a fabric shade',
      'touch control',
    ],
    price: [1900, 32000],
  },
  workspace: {
    nouns: [
      'Keyboard',
      'Laptop Stand',
      'Monitor Arm',
      'Desk Mat',
      'Mouse',
      'Cable Tray',
      'Footrest',
    ],
    adjectives: ['Mechanical', 'Aluminium', 'Ergonomic', 'Low-Profile', 'Adjustable', 'Compact'],
    features: [
      'hot-swappable switches',
      'PBT keycaps',
      'a USB-C connection',
      'tool-free assembly',
      'a cork surface',
      'cable routing',
    ],
    price: [1200, 38000],
  },
  home: {
    nouns: ['Throw Blanket', 'Cushion Cover', 'Vase', 'Mirror', 'Shelf', 'Rug', 'Storage Basket'],
    adjectives: ['Linen', 'Stoneware', 'Woven', 'Oak', 'Marble', 'Handmade'],
    features: [
      'a stonewashed finish',
      'a matte glaze',
      'natural jute fibres',
      'a solid oak frame',
      'hand-thrown detailing',
    ],
    price: [1500, 26000],
  },
  kitchen: {
    nouns: [
      'Mug Set',
      'Chef Knife',
      'Cutting Board',
      'French Press',
      'Kettle',
      'Mixing Bowls',
      'Pepper Mill',
    ],
    adjectives: ['Stoneware', 'Carbon Steel', 'Walnut', 'Glass', 'Enamel', 'Cast Iron'],
    features: [
      'a dishwasher-safe glaze',
      'a full-tang blade',
      'end-grain construction',
      'a double-wall body',
      'an ergonomic handle',
    ],
    price: [1200, 24000],
  },
  outdoor: {
    nouns: ['Camp Chair', 'Water Bottle', 'Picnic Blanket', 'Head Torch', 'Dry Bag', 'Cool Box'],
    adjectives: ['Insulated', 'Packable', 'Waterproof', 'Lightweight', 'Rugged', 'Foldable'],
    features: [
      '24 hour cold retention',
      'a roll-top closure',
      'ripstop fabric',
      'a rechargeable battery',
      'a compact carry case',
    ],
    price: [1400, 21000],
  },
  fitness: {
    nouns: ['Yoga Mat', 'Kettlebell', 'Resistance Bands', 'Foam Roller', 'Jump Rope', 'Gym Towel'],
    adjectives: ['Non-Slip', 'Cast Iron', 'Textured', 'Weighted', 'Cork', 'Adjustable'],
    features: [
      'a closed-cell surface',
      'a natural cork top',
      'a powder-coated finish',
      'a carrying strap',
      'graduated resistance',
    ],
    price: [900, 18000],
  },
  stationery: {
    nouns: ['Notebook', 'Fountain Pen', 'Pencil Set', 'Planner', 'Sketchbook', 'Desk Diary'],
    adjectives: ['Dot Grid', 'Hardbound', 'Refillable', 'Pocket', 'Layflat', 'Recycled'],
    features: [
      'a sewn binding that lies flat',
      '120gsm paper',
      'a fine nib',
      'an elastic closure',
      'a ribbon marker',
    ],
    price: [600, 9500],
  },
  bags: {
    nouns: ['Backpack', 'Tote', 'Messenger Bag', 'Weekender', 'Sling Pack', 'Laptop Sleeve'],
    adjectives: [
      'Waxed Canvas',
      'Roll-Top',
      'Padded',
      'Minimal',
      'Water-Resistant',
      'Leather-Trimmed',
    ],
    features: [
      'a padded 16 inch laptop compartment',
      'YKK zips',
      'a waxed cotton shell',
      'hidden side pockets',
      'an adjustable strap',
    ],
    price: [3200, 42000],
  },
  accessories: {
    nouns: ['Wallet', 'Card Holder', 'Watch Strap', 'Key Organiser', 'Sunglasses', 'Belt'],
    adjectives: ['Leather', 'Slim', 'Woven', 'Titanium', 'Vegetable-Tanned', 'Minimal'],
    features: [
      'RFID blocking',
      'quick-release pins',
      'full-grain leather',
      'a hand-stitched edge',
      'polarised lenses',
    ],
    price: [1800, 28000],
  },
}

const STORES = [
  {
    storeName: 'Nova Supply Co',
    slug: 'nova-supply-co',
    brand: 'Nova',
    email: 'seller@example.com',
    first: 'Nadia',
  },
  {
    storeName: 'Atelier Ito',
    slug: 'atelier-ito',
    brand: 'Atelier',
    email: 'atelier@example.com',
    first: 'Kenji',
  },
  {
    storeName: 'Harbour Goods',
    slug: 'harbour-goods',
    brand: 'Harbour',
    email: 'harbour@example.com',
    first: 'Maeve',
  },
  {
    storeName: 'Fieldnote',
    slug: 'fieldnote',
    brand: 'Fieldnote',
    email: 'fieldnote@example.com',
    first: 'Tomas',
  },
  {
    storeName: 'Copper & Cane',
    slug: 'copper-and-cane',
    brand: 'Copper',
    email: 'copper@example.com',
    first: 'Ines',
  },
  {
    storeName: 'Northbound',
    slug: 'northbound',
    brand: 'Northbound',
    email: 'north@example.com',
    first: 'Alva',
  },
  {
    storeName: 'Studio Marlow',
    slug: 'studio-marlow',
    brand: 'Marlow',
    email: 'marlow@example.com',
    first: 'Ruth',
  },
  {
    storeName: 'Kite & Loom',
    slug: 'kite-and-loom',
    brand: 'Kite',
    email: 'kite@example.com',
    first: 'Omar',
  },
]

const FIRST_NAMES = [
  'Ana',
  'Ben',
  'Cleo',
  'Dev',
  'Eli',
  'Farah',
  'Gus',
  'Hana',
  'Iris',
  'Jonas',
  'Kira',
  'Leo',
  'Mira',
  'Noor',
  'Otto',
  'Pia',
  'Quinn',
  'Rosa',
  'Sam',
  'Tara',
  'Uma',
  'Viktor',
  'Wren',
  'Yusuf',
  'Zara',
]
const LAST_NAMES = [
  'Adeyemi',
  'Brandt',
  'Castillo',
  'Dupont',
  'Eriksen',
  'Ferrari',
  'Gallagher',
  'Haddad',
  'Ivanov',
  'Jensen',
  'Kowalski',
  'Lindqvist',
  'Moreau',
  'Nakamura',
  'Okafor',
  'Petrov',
  'Rossi',
  'Silva',
  'Tanaka',
  'Vargas',
]

const REVIEW_TEXT = {
  5: [
    'Exactly what I hoped for. The build quality is a clear step above what I replaced.',
    'Genuinely excellent — I have already ordered a second one.',
    'Arrived quickly and looks better in person than in the photos.',
  ],
  4: [
    'Very good overall. Minor niggle with the packaging but the product itself is solid.',
    'Does the job well. Would have liked one more colour option.',
    'Happy with it after a few weeks of daily use.',
  ],
  3: [
    'Fine for the price. Nothing remarkable either way.',
    'Works, but the finish is not quite what I expected.',
    'Decent, though it took longer to arrive than stated.',
  ],
  2: [
    'Disappointing. The material feels cheaper than the description suggests.',
    'Started showing wear within a fortnight.',
  ],
  1: ['Did not last a month. Would not buy again.', 'Arrived damaged and the fit was wrong.'],
}

const ADDRESS = {
  firstName: 'Demo',
  lastName: 'Buyer',
  line1: '14 Harbour Way',
  city: 'Bristol',
  state: 'Bristol',
  postalCode: 'BS1 4AA',
  country: 'GB',
}

const now = Date.now()
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000)
const oid = () => new mongoose.Types.ObjectId()

async function run() {
  await connectDatabase()
  const db = mongoose.connection.db
  const col = (n) => db.collection(n)

  if (FRESH) {
    console.log('--fresh: clearing generated collections')
    for (const n of [
      'products',
      'productvariants',
      'inventories',
      'orders',
      'sellerorders',
      'orderitems',
      'reviews',
      'categories',
      'sellers',
      'coupons',
      'recentlyvieweds',
    ]) {
      await col(n).deleteMany({})
    }
    await col('users').deleteMany({ email: { $regex: '@example\\.com$' } })
  }

  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'Password123!', 12)
  const stamp = { createdAt: new Date(), updatedAt: new Date() }

  // ---- categories -------------------------------------------------------
  const categories = CATEGORIES.map((c, i) => ({
    _id: oid(),
    name: c.name,
    slug: c.slug,
    parentId: null,
    description: `${c.name} goods from independent makers.`,
    status: 'active',
    sortOrder: i,
    ...stamp,
  }))
  await col('categories').bulkWrite(
    // _id must be removed from $set entirely — setting it to undefined makes
    // MongoDB write null, and every upsert then collides on the _id index.
    categories.map(({ _id: _ignored, ...c }) => ({
      updateOne: { filter: { slug: c.slug, parentId: null }, update: { $set: c }, upsert: true },
    })),
  )
  const catDocs = await col('categories').find({}).toArray()
  const catBySlug = new Map(catDocs.map((c) => [c.slug, c]))
  console.log(`categories: ${catDocs.length}`)

  // ---- sellers ----------------------------------------------------------
  const sellers = []
  for (const store of STORES) {
    await col('users').updateOne(
      { email: store.email },
      {
        $set: {
          firstName: store.first,
          lastName: 'Seller',
          role: 'seller',
          status: 'active',
          sellerApprovalStatus: 'approved',
          updatedAt: new Date(),
        },
        $setOnInsert: { passwordHash, addresses: [], createdAt: new Date() },
      },
      { upsert: true },
    )
    const owner = await col('users').findOne({ email: store.email })
    await col('sellers').updateOne(
      { slug: store.slug },
      {
        $set: {
          ownerUserId: owner._id,
          storeName: store.storeName,
          status: 'approved',
          approvedAt: daysAgo(between(120, 400)),
          description: `${store.storeName} makes considered goods in small runs.`,
          ratingAverage: mongoose.Types.Decimal128.fromString('0'),
          ratingCount: 0,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: daysAgo(between(120, 400)) },
      },
      { upsert: true },
    )
    const seller = await col('sellers').findOne({ slug: store.slug })
    await col('users').updateOne({ _id: owner._id }, { $set: { sellerId: seller._id } })
    sellers.push({ ...seller, brand: store.brand })
  }
  console.log(`sellers: ${sellers.length}`)

  // ---- customers --------------------------------------------------------
  const customerOps = []
  const customers = []
  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`
    const _id = oid()
    customers.push({ _id, email })
    customerOps.push({
      updateOne: {
        filter: { email },
        update: {
          $set: {
            firstName: first,
            lastName: last,
            role: 'customer',
            status: chance(0.04) ? 'suspended' : 'active',
            updatedAt: new Date(),
          },
          $setOnInsert: {
            _id,
            passwordHash,
            addresses: [],
            sellerApprovalStatus: 'not_applicable',
            createdAt: daysAgo(between(1, 300)),
          },
        },
        upsert: true,
      },
    })
  }
  for (const email of ['buyer@example.com', 'admin@example.com']) {
    customerOps.push({
      updateOne: {
        filter: { email },
        update: {
          $set: {
            firstName: email.startsWith('admin') ? 'Ada' : 'Bo',
            lastName: email.startsWith('admin') ? 'Admin' : 'Buyer',
            role: email.startsWith('admin') ? 'admin' : 'customer',
            status: 'active',
            updatedAt: new Date(),
          },
          $setOnInsert: {
            passwordHash,
            addresses: [],
            sellerApprovalStatus: 'not_applicable',
            createdAt: daysAgo(300),
          },
        },
        upsert: true,
      },
    })
  }
  await col('users').bulkWrite(customerOps)
  const customerDocs = await col('users').find({ role: 'customer' }).project({ _id: 1 }).toArray()
  console.log(`customers: ${customerDocs.length}`)

  // ---- products, variants, inventory ------------------------------------
  const products = []
  const variants = []
  const inventories = []
  const usedSlugs = new Set()

  for (let i = 0; i < PRODUCT_COUNT; i += 1) {
    const category = CATEGORIES[i % CATEGORIES.length]
    const vocab = VOCAB[category.slug]
    const seller = sellers[between(0, sellers.length - 1)]
    const noun = pick(vocab.nouns)
    const adjective = pick(vocab.adjectives)
    const title = `${seller.brand} ${adjective} ${noun}`
    let slug = `${title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (usedSlugs.has(`${seller._id}:${slug}`)) slug = `${slug}-${i}`
    usedSlugs.add(`${seller._id}:${slug}`)

    const basePrice = between(vocab.price[0], vocab.price[1])
    const productId = oid()
    const created = daysAgo(between(1, DAYS + 120))
    // A small share are not sellable, so moderation queues and status filters
    // have something in them.
    const status = chance(0.06) ? pick(['draft', 'pending_review', 'removed']) : 'active'

    const variantCount = chance(0.35) ? between(2, 3) : 1
    const variantNames = ['Standard', 'Large', 'Black', 'Natural', 'Slate']
    const prices = []

    for (let v = 0; v < variantCount; v += 1) {
      const variantId = oid()
      const priceMinor = v === 0 ? basePrice : Math.round(basePrice * (1 + v * 0.12))
      const discountPercent = chance(0.18) ? pick([5, 10, 15, 20]) : 0
      const currentPriceMinor = Math.round(priceMinor * (1 - discountPercent / 100))
      prices.push(currentPriceMinor)

      variants.push({
        _id: variantId,
        productId,
        sellerId: seller._id,
        sku: `${slug.slice(0, 28).toUpperCase()}-${v + 1}-${i}`,
        name: variantNames[v] ?? `Option ${v + 1}`,
        priceMinor,
        discountPercent,
        currentPriceMinor,
        status: 'active',
        createdAt: created,
        updatedAt: created,
      })

      // A deliberate spread: mostly healthy stock, some low, some sold out, so
      // the low-stock dashboards and the in-stock filter are exercised.
      const roll = rand()
      const quantityOnHand = roll < 0.08 ? 0 : roll < 0.2 ? between(1, 5) : between(10, 200)
      inventories.push({
        _id: oid(),
        sellerId: seller._id,
        productId,
        variantId,
        sku: variants.at(-1).sku,
        quantityOnHand,
        quantityReserved: 0,
        quantityAvailable: quantityOnHand,
        lowStockThreshold: 5,
        isLowStock: quantityOnHand <= 5,
        status: quantityOnHand > 0 ? 'active' : 'out_of_stock',
        version: 0,
        createdAt: created,
        updatedAt: created,
      })
    }

    const minPrice = Math.min(...prices)
    products.push({
      _id: productId,
      sellerId: seller._id,
      categoryIds: [catBySlug.get(category.slug)._id],
      title,
      slug,
      description: `${title} with ${pick(vocab.features)} and ${pick(vocab.features)}. Made in small batches by ${seller.storeName}.`,
      brand: seller.brand,
      images: [{ url: imageForCategory(category.slug, slug), alt: title }],
      hasVariants: true,
      status,
      priceMinor: minPrice,
      currentPriceMinor: minPrice,
      minPriceMinor: minPrice,
      maxPriceMinor: Math.max(...prices),
      currency: 'USD',
      discountPercent: 0,
      attributes: {},
      ratingAverage: mongoose.Types.Decimal128.fromString('0'),
      ratingCount: 0,
      createdAt: created,
      updatedAt: created,
      __v: 0,
    })
  }

  const chunk = (arr, size) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size),
    )
  for (const batch of chunk(products, 200))
    await col('products').insertMany(batch, { ordered: false })
  for (const batch of chunk(variants, 200))
    await col('productvariants').insertMany(batch, { ordered: false })
  for (const batch of chunk(inventories, 200))
    await col('inventories').insertMany(batch, { ordered: false })
  console.log(
    `products: ${products.length}  variants: ${variants.length}  inventory rows: ${inventories.length}`,
  )

  // ---- orders -----------------------------------------------------------
  const sellableVariants = variants.filter((v) => {
    const p = products.find((x) => x._id.equals(v.productId))
    return p && p.status === 'active'
  })
  const productById = new Map(products.map((p) => [p._id.toString(), p]))

  const orders = []
  const sellerOrders = []
  const orderItems = []
  const purchases = [] // feeds review generation

  for (let i = 0; i < ORDER_COUNT; i += 1) {
    const customer = customerDocs[between(0, customerDocs.length - 1)]
    const placed = daysAgo(between(0, DAYS))
    const lineCount = chance(0.3) ? between(2, 4) : 1
    const chosen = []
    for (let l = 0; l < lineCount; l += 1)
      chosen.push(sellableVariants[between(0, sellableVariants.length - 1)])

    const orderId = oid()
    const bySeller = new Map()
    let subtotal = 0

    for (const variant of chosen) {
      const product = productById.get(variant.productId.toString())
      const quantity = chance(0.75) ? 1 : between(2, 3)
      const line = variant.currentPriceMinor * quantity
      subtotal += line
      const key = variant.sellerId.toString()
      if (!bySeller.has(key)) bySeller.set(key, { sellerId: variant.sellerId, lines: [], total: 0 })
      bySeller.get(key).lines.push({ variant, product, quantity, line })
      bySeller.get(key).total += line
    }

    // Most orders are paid; the rest give the dashboards realistic other states.
    const roll = rand()
    const paymentStatus =
      roll < 0.82 ? 'paid' : roll < 0.9 ? 'pending' : roll < 0.96 ? 'failed' : 'refunded'
    const status =
      paymentStatus === 'paid'
        ? pick(['confirmed', 'processing', 'shipped', 'delivered', 'delivered'])
        : paymentStatus === 'refunded'
          ? 'refunded'
          : paymentStatus === 'failed'
            ? 'cancelled'
            : 'pending'

    orders.push({
      _id: orderId,
      orderNumber: `ORD-${(100000 + i).toString(36).toUpperCase()}-${i}`,
      customerId: customer._id,
      sellerIds: [...bySeller.values()].map((g) => g.sellerId),
      status,
      paymentStatus,
      currency: 'USD',
      subtotalMinor: subtotal,
      shippingMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: subtotal,
      refundedMinor: paymentStatus === 'refunded' ? subtotal : 0,
      couponSnapshots: [],
      shippingAddressSnapshot: ADDRESS,
      billingAddressSnapshot: ADDRESS,
      placedAt: paymentStatus === 'paid' ? placed : undefined,
      createdAt: placed,
      updatedAt: placed,
      __v: 0,
    })

    for (const group of bySeller.values()) {
      const sellerOrderId = oid()
      sellerOrders.push({
        _id: sellerOrderId,
        orderId,
        sellerId: group.sellerId,
        sellerOrderNumber: `ORD-${(100000 + i).toString(36).toUpperCase()}-${i}-${group.sellerId.toString().slice(-4)}`,
        status: status === 'pending' ? 'pending' : status,
        subtotalMinor: group.total,
        shippingMinor: 0,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: group.total,
        itemCount: group.lines.length,
        createdAt: placed,
        updatedAt: placed,
        __v: 0,
      })
      for (const l of group.lines) {
        const orderItemId = oid()
        orderItems.push({
          _id: orderItemId,
          orderId,
          sellerOrderId,
          sellerId: group.sellerId,
          productId: l.product._id,
          variantId: l.variant._id,
          productSnapshot: {
            title: l.product.title,
            brand: l.product.brand,
            imageUrl: l.product.images[0].url,
          },
          variantSnapshot: { name: l.variant.name, sku: l.variant.sku },
          unitPriceMinor: l.variant.currentPriceMinor,
          quantity: l.quantity,
          discountMinor: 0,
          taxMinor: 0,
          shippingMinor: 0,
          lineTotalMinor: l.line,
          fulfillmentStatus: status === 'pending' ? 'pending' : status,
          createdAt: placed,
          updatedAt: placed,
          __v: 0,
        })
        if (paymentStatus === 'paid') {
          purchases.push({
            customerId: customer._id,
            productId: l.product._id,
            sellerId: group.sellerId,
            orderId,
            orderItemId,
            placed,
          })
        }
      }
    }
  }

  for (const batch of chunk(orders, 200)) await col('orders').insertMany(batch, { ordered: false })
  for (const batch of chunk(sellerOrders, 200))
    await col('sellerorders').insertMany(batch, { ordered: false })
  for (const batch of chunk(orderItems, 200))
    await col('orderitems').insertMany(batch, { ordered: false })
  console.log(
    `orders: ${orders.length}  seller orders: ${sellerOrders.length}  order items: ${orderItems.length}`,
  )

  // ---- reviews (only from real purchases, one per customer per product) ---
  const reviews = []
  const seen = new Set()
  const ratingTally = new Map()

  for (const purchase of purchases) {
    if (reviews.length >= REVIEW_COUNT) break
    const key = `${purchase.customerId}:${purchase.productId}`
    if (seen.has(key)) continue
    if (!chance(0.55)) continue
    seen.add(key)

    // Weighted toward positive, as real catalogues are.
    const roll = rand()
    const rating = roll < 0.46 ? 5 : roll < 0.76 ? 4 : roll < 0.9 ? 3 : roll < 0.97 ? 2 : 1
    const status = chance(0.92) ? 'published' : 'pending'

    reviews.push({
      _id: oid(),
      productId: purchase.productId,
      sellerId: purchase.sellerId,
      customerId: purchase.customerId,
      orderId: purchase.orderId,
      orderItemId: purchase.orderItemId,
      rating,
      title: '',
      text: pick(REVIEW_TEXT[rating]),
      images: [],
      verifiedPurchase: true,
      status,
      createdAt: new Date(purchase.placed.getTime() + between(1, 14) * 86400000),
      updatedAt: new Date(),
      __v: 0,
    })

    if (status === 'published') {
      const k = purchase.productId.toString()
      const t = ratingTally.get(k) ?? { sum: 0, count: 0 }
      t.sum += rating
      t.count += 1
      ratingTally.set(k, t)
    }
  }
  for (const batch of chunk(reviews, 200))
    await col('reviews').insertMany(batch, { ordered: false })
  console.log(`reviews: ${reviews.length}`)

  // Ratings must agree with the reviews that exist, or the data is incoherent.
  const ratingOps = [...ratingTally.entries()].map(([productId, t]) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(productId) },
      update: {
        $set: {
          ratingAverage: mongoose.Types.Decimal128.fromString((t.sum / t.count).toFixed(1)),
          ratingCount: t.count,
        },
      },
    },
  }))
  if (ratingOps.length)
    for (const batch of chunk(ratingOps, 300)) await col('products').bulkWrite(batch)
  console.log(`product ratings recomputed: ${ratingOps.length}`)

  // ---- coupons ----------------------------------------------------------
  const admin = await col('users').findOne({ email: 'admin@example.com' })
  const coupons = [
    { code: 'WELCOME10', discountType: 'fixed', discountValue: 1000, status: 'active' },
    {
      code: 'SAVE20',
      discountType: 'percentage',
      discountValue: 20,
      maximumDiscountMinor: 5000,
      status: 'active',
    },
    { code: 'FREESHIP', discountType: 'fixed', discountValue: 500, status: 'active' },
    { code: 'LASTYEAR', discountType: 'fixed', discountValue: 1500, status: 'inactive' },
  ]
  await col('coupons').bulkWrite(
    coupons.map((c) => ({
      updateOne: {
        filter: { code: c.code },
        update: {
          $set: {
            ownerType: 'platform',
            currency: 'USD',
            startsAt: daysAgo(30),
            expiresAt: daysAgo(-365),
            perUserUsageLimit: 1,
            usageCount: between(0, 40),
            status: c.status,
            discountType: c.discountType,
            discountValue: c.discountValue,
            maximumDiscountMinor: c.maximumDiscountMinor,
            createdBy: admin._id,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: daysAgo(30) },
        },
        upsert: true,
      },
    })),
  )
  console.log(`coupons: ${coupons.length}`)

  // ---- summary ----------------------------------------------------------
  const paid = orders.filter((o) => o.paymentStatus === 'paid')
  const revenue = paid.reduce((t, o) => t + o.totalMinor, 0)
  console.log('\n--- summary ---')
  console.log(
    `documents written: ${products.length + variants.length + inventories.length + orders.length + sellerOrders.length + orderItems.length + reviews.length}`,
  )
  console.log(`paid orders: ${paid.length}  gross revenue: $${(revenue / 100).toFixed(2)}`)
  console.log(`\nAll accounts use password: ${process.env.SEED_PASSWORD || 'Password123!'}`)
  console.log('  admin@example.com    admin')
  console.log('  seller@example.com   seller (Nova Supply Co)')
  console.log('  buyer@example.com    customer')
  console.log('  ...plus 8 stores and %d generated customers', CUSTOMER_COUNT)

  await disconnectDatabase()
}

run().catch(async (error) => {
  console.error('Seed failed:', error)
  await disconnectDatabase().catch(() => {})
  process.exitCode = 1
})
