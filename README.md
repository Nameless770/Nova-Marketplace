# Marketplace

Initial monorepo foundation for the multi-vendor marketplace.

## Structure

```text
client/                 React + Vite frontend
server/                 Node.js + Express backend
  config/               Runtime configuration (reserved)
  controllers/          HTTP request handlers (reserved)
  middleware/           Cross-cutting request middleware (reserved)
  models/               Database models (reserved)
  routes/               API route definitions (reserved)
  services/             Business services (reserved)
  utils/                Shared backend helpers (reserved)
  server.js             Express application entry point
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Setup

```bash
npm install
npm install --prefix client
npm install --prefix server
```

Copy `server/.env.example` to `server/.env` for local environment overrides.

## Run

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API health endpoint at
`http://localhost:5000/api/health`.

Run either workspace individually with `npm run dev --prefix client` or `npm run dev --prefix server`.

## Quality checks

```bash
npm run lint
npm run format:check
npm run build
```

## Implementation status

Implemented (backend + tests): authentication, products/categories, search (MongoDB `$text` with
cursor pagination and facets), cart, wishlist, seller applications and moderation, transactional
inventory with expiring reservations, multi-vendor orders (`Order` → `SellerOrder` → `OrderItem`),
Stripe checkout with webhook-confirmed payment, coupons with redemption records, reviews, Q&A,
notifications, and admin moderation APIs.

Implemented (customer UI): home, product listing and details with reviews, cart, wishlist, checkout
with coupon entry, orders, order details, payment result pages, profile, login, and registration.

Not yet implemented: refunds, seller ledger/payouts, the outbox pattern, analytics aggregation,
seller and admin dashboards, notification UI, frontend tests, Redis, Docker, CI/CD, Kubernetes, and
monitoring.

Money is stored throughout as integer minor units (e.g. `$19.99` → `1999`) with an explicit currency.
