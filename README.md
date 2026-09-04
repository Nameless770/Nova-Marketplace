# Nova Market

A multi-vendor marketplace built as a **modular monolith** — three roles (customer, seller,
admin), a React SPA, and an Express API over MongoDB.

The project exists to demonstrate production-shaped engineering rather than a feature checklist:
money is handled in integer minor units, inventory is reserved with conditional updates that
cannot oversell under concurrency, multi-tenant access is scoped server-side, and the AI layer is
built so the model can influence _selection_ but never _facts_.

> **On accuracy.** This README distinguishes what is implemented and tested from what is written
> but unverified. Sections describing infrastructure that has never been executed
> ([Docker](#running-with-docker), [Kubernetes](#kubernetes-deployment)) say so explicitly, as do
> the parts of [Monitoring](#monitoring) that the application emits but nothing yet collects.

---

## Contents

1. [Project overview](#project-overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Folder structure](#folder-structure)
6. [Environment variables](#environment-variables)
7. [Local setup](#local-setup)
8. [Running with Docker](#running-with-docker)
9. [API overview](#api-overview)
10. [Authentication](#authentication)
11. [AI architecture](#ai-architecture)
12. [Testing](#testing)
13. [CI/CD](#cicd)
14. [Kubernetes deployment](#kubernetes-deployment)
15. [Monitoring](#monitoring)
16. [Security considerations](#security-considerations)

---

## Project overview

Nova Market is a marketplace where independent sellers list products and customers buy them. It is
deliberately a **modular monolith**, not microservices: one deployable API with clear service
boundaries inside it. At this scale that keeps multi-document transactions simple and avoids
distributed-systems overhead that the domain does not yet justify.

Three roles, enforced server-side:

| Role         | Can do                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| **Customer** | Browse, search, cart, wishlist, checkout, track orders, AI assistant     |
| **Seller**   | Manage own catalogue, inventory, orders, store profile, view own revenue |
| **Admin**    | Platform oversight: users, sellers, catalogue, orders, refunds, coupons  |

### Domain rules the code depends on

These are load-bearing. Breaking one causes a subtle bug rather than a crash.

- **Money is integer minor units.** `$19.99` is stored as `1999` plus a currency code. Every money
  field validates with `Number.isSafeInteger`. No floats anywhere.
- **Prices are re-read at capture.** `orderService` re-reads `variant.currentPriceMinor` inside the
  transaction rather than trusting the client. The cart does the same.
- **Inventory reservation is a conditional update.** `quantityAvailable: { $gte: qty }` inside
  `findOneAndUpdate` is what prevents overselling under concurrency — not a read-then-write.
- **Over-refunding is structurally impossible.** Same pattern:
  `$expr: refundedMinor + amount <= amountMinor`.
- **`paymentStatus` has five values**, not four: `pending`, `paid`, `failed`, `partially_refunded`,
  `refunded`. Filtering on `'paid'` alone silently excludes partially refunded orders.
- **Idempotency keys are enforced by unique database indexes**, not application checks.

---

## Features

### Implemented, with backend and UI

- **Authentication & registration** — JWT access tokens, role-based authorisation, plus
  **Sign in with Google** (OAuth 2.0 authorization-code flow, [details](#authentication))
- **Catalogue** — products, variants, categories; seller-managed creation and editing
- **Search & filtering** — MongoDB `$text`, cursor pagination, category / rating / **price-range**
  filters with clearable filter chips
- **Product media** — real photos with a generated fallback, plus an interactive **3D model** view
  on the product page (lazy-loaded Three.js)
- **Cart & wishlist** — live item count in the header, quantity stepper on product cards
- **Checkout** — coupon validation, inventory reservation, map-based delivery location
- **Cash on delivery** — orders confirm on placement; payment is collected at handover
- **Order tracking** — `confirmed → preparing → shipped → out for delivery → delivered`, with a
  timestamped status history shown as a progress tracker
- **Refunds** — partial, idempotent, concurrency-safe; allocated per seller
- **Reviews** — star rating and comment, offered per product on a delivered order; verified-purchase
  badge; author sees their own review before moderation
- **Questions & answers** — shoppers ask on the product page, sellers answer, both moderated
- **Seller dashboard** — 8 sections including revenue analytics and order fulfilment
- **Admin dashboard** — 9 sections including refunds and moderation
- **Recommendations** — "for you", similar products, recently viewed
- **AI shopping assistant** — natural-language product help ([details](#ai-architecture))
- **Audit log** — append-only, written inside the transaction on privileged mutations
- **Rate limiting** — login brute-force lockout, per-IP spray cap, AI throttling

### Implemented backend, no user interface

| Feature                       | Endpoint                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| AI natural-language search    | `POST /api/v1/ai/search`                                          |
| AI admin analytics assistant  | `POST /api/v1/ai/admin-assistant`                                 |
| Seller application / approval | `POST /api/v1/sellers/applications` (approval UI exists in admin) |
| Seller coupons                | `/api/v1/coupons/seller`                                          |
| Customer notifications        | `/api/v1/notifications`                                           |
| Profile addresses / password  | `/api/v1/users/me/*`                                              |

### Not built

Seller payouts and ledger · outbox pattern · Redis · analytics rollups · refresh tokens · metric
collection infrastructure ([see Monitoring](#monitoring)) · error tracking (Sentry).

---

## Architecture

```
┌──────────────────┐         ┌───────────────────────────────────────────┐
│  React SPA       │  HTTPS  │  Express API (modular monolith)           │
│  (Vite build,    │────────▶│                                           │
│   nginx in prod) │  /api   │  routes → middleware → controllers        │
└──────────────────┘         │                    ↓                      │
                             │              services (business logic)    │
┌──────────────────┐         │                    ↓                      │
│  AI provider     │◀────────│              models (Mongoose)            │
│  (Anthropic or   │  tools  │                                           │
│   OpenAI-compat) │         └───────────────────┬───────────────────────┘
└──────────────────┘                             │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  MongoDB replica set   │
                                    │  (transactions)        │
                                    └────────────────────────┘
```

**Request flow:** `routes` declare the surface and attach middleware → `middleware` authenticates,
authorises, validates and rate-limits → `controllers` translate HTTP to service calls → `services`
hold all business logic and own transactions → `models` define schemas and indexes.

Controllers contain no business logic; services never touch `request`/`response`. That split is
what makes the services directly testable.

### MongoDB must be a replica set

Seven services use `session.withTransaction`. A standalone `mongod` starts fine and then fails on
the first checkout, because standalone MongoDB does not support multi-document transactions. Tests
use `MongoMemoryReplSet`; Docker Compose runs `--replSet rs0`.

---

## Tech stack

| Layer         | Technology                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| Frontend      | React 19, Vite, React Router 7, Axios, Leaflet (map), Three.js (3D viewer)  |
| Backend       | Node.js 22, Express 5, pure ESM (`"type": "module"`)                        |
| Database      | MongoDB with Mongoose 8 — replica set required                              |
| Auth          | JSON Web Tokens (`jsonwebtoken`), bcrypt hashing, Google OAuth 2.0 (no SDK) |
| AI            | Anthropic SDK, plus an OpenAI-compatible transport                          |
| Payments      | Cash on delivery; Stripe SDK retained for the refund path                   |
| Observability | `pino` structured logging, `prom-client` metrics                            |
| Testing       | Vitest + Supertest (backend), Vitest + Testing Library (frontend)           |
| Tooling       | ESLint (flat config), Prettier                                              |
| CI            | GitHub Actions                                                              |
| Packaging     | Docker (multi-stage), Kubernetes manifests                                  |

---

## Folder structure

```text
.
├── client/                     React SPA
│   └── src/
│       ├── components/         Reusable UI (ProductCard, OrderTracker, …)
│       ├── context/            Auth, Cart and Wishlist providers
│       ├── hooks/              useApiQuery
│       ├── layouts/            Route guards and dashboard shells
│       ├── pages/              Route components (admin/ and seller/ nested)
│       ├── services/api.js     Single axios instance + typed API surface
│       └── utils/              Formatting, order status labels
│
├── server/                     Express API
│   ├── config/database.js      Mongoose connection
│   ├── controllers/            HTTP ↔ service translation
│   ├── middleware/             auth, rate limiting, per-resource validation
│   ├── models/                 25 Mongoose schemas
│   ├── routes/                 18 route modules, mounted under /api/v1
│   ├── services/               Business logic; owns transactions
│   │   └── ai/                 Provider, prompts, schemas, grounding
│   ├── scripts/                Seeding and maintenance
│   ├── test/                   20 Vitest suites + factories
│   ├── app.js                  Express app (middleware, routes, error handler)
│   └── server.js               Entry point: connect DB, then listen
│
├── k8s/                        Kubernetes manifests (see caveat)
├── .github/workflows/ci.yml    Lint, test, build, image publish
└── docker-compose.yml          App + single-node replica set
```

---

## Environment variables

All server configuration lives in `server/.env`. A template is committed at
`server/.env.example`. The file is gitignored and excluded from the Docker build context.

| Variable                          | Required      | Description                                                     |
| --------------------------------- | ------------- | --------------------------------------------------------------- |
| `PORT`                            | no (5000)     | API listen port                                                 |
| `CLIENT_ORIGIN`                   | in production | Allowed CORS origin. The API refuses to boot without it in prod |
| `NODE_ENV`                        | no            | `development` / `production`                                    |
| `MONGODB_URI`                     | **yes**       | Must point at a replica set                                     |
| `DNS_SERVERS`                     | no            | Comma-separated resolvers; works around SRV lookup failures     |
| `JWT_SECRET`                      | **yes**       | Minimum 32 characters of real entropy; validated at startup     |
| `JWT_EXPIRES_IN`                  | no (15m)      | Access token lifetime                                           |
| `RESERVATION_CLEANUP_INTERVAL_MS` | no (60000)    | Expired-reservation sweep interval                              |
| `ANTHROPIC_API_KEY`               | no            | Enables AI features. Absent ⇒ they degrade, they do not crash   |
| `ANTHROPIC_WORKSPACE_ID`          | conditional   | Only for identity-linked Anthropic keys                         |
| `AI_MODEL`                        | no            | Model id override                                               |
| `AI_BASE_URL`                     | no            | OpenAI-compatible endpoint, when not using Anthropic            |
| `STRIPE_SECRET_KEY`               | no            | Refund path only. Unset ⇒ refunds report as unconfigured        |
| `STRIPE_WEBHOOK_SECRET`           | no            | Verifies inbound Stripe webhooks                                |
| `PAYMENT_SUCCESS_URL`             | no            | Post-checkout redirect                                          |
| `PAYMENT_CANCEL_URL`              | no            | Cancelled-checkout redirect                                     |
| `GOOGLE_CLIENT_ID`                | no            | Enables Google sign-in. Absent ⇒ the button is hidden           |
| `GOOGLE_CLIENT_SECRET`            | conditional   | Required with `GOOGLE_CLIENT_ID`                                |
| `GOOGLE_CALLBACK_URL`             | no            | Defaults to `/api/v1/auth/google/callback` on localhost:5000    |

Ports are pinned rather than incidental: `CLIENT_ORIGIN` builds the CORS allowlist and the client
defaults to `http://localhost:5000/api/v1`. Running either service on a different port produces
CORS errors.

> `server/.env` is loaded with `override: true`, so the file is authoritative in local development
> and a stale exported shell variable cannot silently win. In production no `.env` file exists, so
> real environment variables apply as normal.

---

## Local setup

### Prerequisites

- Node.js 22+
- A MongoDB **replica set** (Atlas, or a local `mongod --replSet`)

### Install and run

```bash
npm install
npm install --prefix client
npm install --prefix server
```

Copy the environment template and fill it in:

```bash
cp server/.env.example server/.env
```

Seed a catalogue, then start both services:

```bash
npm run seed:large --prefix server
npm run dev
```

- API → `http://localhost:5000`
- SPA → `http://localhost:5173`

### Available scripts

| Command                              | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `npm run dev`                        | Both services concurrently           |
| `npm run dev --prefix server`        | API only                             |
| `npm run dev --prefix client`        | SPA only                             |
| `npm run lint`                       | ESLint across both workspaces        |
| `npm run format` / `format:check`    | Prettier write / verify              |
| `npm test --prefix server`           | Backend test suite                   |
| `npm run build`                      | Production frontend bundle           |
| `npm run seed --prefix server`       | Small baseline dataset               |
| `npm run seed:large --prefix server` | Full demo dataset (~3,300 documents) |

### Seeded accounts

Password for all seeded accounts: `Password123!`

| Email                | Role                       |
| -------------------- | -------------------------- |
| `admin@example.com`  | admin                      |
| `seller@example.com` | seller — the largest store |
| `buyer@example.com`  | customer                   |

Seven further seller accounts exist (`atelier@`, `harbour@`, `fieldnote@`, `copper@`, `north@`,
`marlow@`, `kite@` — all `@example.com`).

> Sign out before switching accounts. The session lives in `sessionStorage`, and visiting `/login`
> while already signed in keeps the existing session.

---

## Running with Docker

> **Status: written but never executed.** The Dockerfiles and Compose file are complete and
> reviewed, but they have not been built or run on this project's development machine, so they are
> unverified. Treat the commands below as a starting point rather than a tested path.

```bash
docker compose up --build
```

Compose brings up the API, the nginx-served frontend, and a **single-node MongoDB replica set**
initiated through a healthcheck (a standalone instance cannot serve this app's transactions).

Design notes:

- Both images are multi-stage. The backend runs on Alpine as a non-root user with dev dependencies
  dropped.
- The frontend image serves the Vite `dist/` output through nginx and proxies `/api`. Vite inlines
  environment variables at _build_ time, so proxying is what keeps a single image portable across
  environments.

---

## API overview

All endpoints are versioned under `/api/v1` and return a consistent envelope:

```jsonc
// success
{ "success": true, "data": { /* … */ } }

// failure
{ "success": false, "error": { "code": "ORDER_NOT_FOUND", "message": "Order not found" } }
```

| Prefix             | Endpoints | Purpose                                          |
| ------------------ | --------: | ------------------------------------------------ |
| `/auth`            |         7 | Register, log in/out, current user, Google OAuth |
| `/products`        |        11 | Public catalogue plus seller-scoped management   |
| `/categories`      |         4 | Category tree                                    |
| `/cart`            |         5 | Cart contents and line items                     |
| `/wishlist`        |         3 | Saved products                                   |
| `/orders`          |         6 | Customer orders and seller fulfilment            |
| `/payments`        |         3 | Checkout session, status, webhook                |
| `/refunds`         |         3 | Refundable amount, history, create               |
| `/reviews`         |         5 | Product reviews, plus the author's own reviews   |
| `/qa`              |         4 | Product questions and answers                    |
| `/coupons`         |         5 | Validation and seller coupons                    |
| `/inventory`       |         8 | Stock levels and adjustments                     |
| `/sellers`         |         9 | Store profile, dashboard, analytics              |
| `/admin`           |        21 | Platform administration                          |
| `/recommendations` |         3 | For-you, similar, recently viewed                |
| `/notifications`   |         3 | User notifications                               |
| `/users`           |         8 | Profile, addresses, password                     |
| `/ai`              |         3 | Assistant, search, admin assistant               |

Health endpoints sit outside the versioned surface — see [Monitoring](#monitoring).

---

## Authentication

Stateless JWT bearer tokens. `Authorization: Bearer <token>` on every protected request.

**Token hardening** (`server/utils/jwt.js`):

- The verification **algorithm is pinned**, which closes the `alg: none` and
  algorithm-confusion class of attack.
- **Issuer and audience are both set and verified**, so a token minted for another service is
  rejected.
- Access tokens are short-lived — **15 minutes** by default.
- `JWT_SECRET` strength is validated at startup; a weak or placeholder value is refused in
  production.

**Middleware** (`server/middleware/auth.js`):

- `authenticate` — requires a valid token, loads the user, and rejects non-active accounts.
  It deliberately loads the user **without the password hash**, removing a whole class of leak.
- `optionalAuthenticate` — attaches the user when a token is present, for public routes that
  behave differently when signed in. Never a substitute for `authenticate`.
- `authorize(...roles)` — role gate applied after authentication.

**Sign in with Google** (`server/services/googleAuthService.js`): OAuth 2.0 authorization-code
flow, implemented with two `fetch` calls and no SDK. The server — never the browser — exchanges the
code for the profile and mints its own JWT. Three safeguards make it real rather than decorative:

- A random `state` value, stored in an httpOnly cookie and checked on the callback, blocks
  login-CSRF.
- The session is returned in the URL **fragment**, not the query string, so the token never reaches
  a server access log or a `Referer` header.
- A Google identity may attach to an existing account **only when Google marks the email verified** —
  otherwise it is an account takeover. A Google-only account has no password hash, and the password
  login path guards against comparing against an absent hash.

The flow is code-complete with 13 tests (`server/test/google-oauth.test.js`, Google stubbed at the
network boundary). It is dormant until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set; without
them the endpoints return `503` and the button is hidden.

**Brute-force protection:** five consecutive failures lock an account, with a separate per-IP cap
to limit credential spraying. Only failures count toward the limit.

**Multi-tenant scoping:** seller-scoped queries resolve the seller from the `Seller` collection,
never from a denormalised `user.sellerId` — an unset field there would fail _open_ to the whole
catalogue. Every customer-facing order lookup filters by `customerId`, so one customer requesting
another's order receives a 404.

---

## AI architecture

Three AI features share one provider module and one grounding contract.

### The grounding contract

> **The model selects. The database renders.**

The model may emit entity IDs and prose. It may never emit a price, stock level, rating, or product
name that reaches a user. This is enforced in code, at four layers:

1. **Retrieval-only context** — no product knowledge reaches the model except tool results.
2. **Output schema has no fact fields** — there is no price or title field for the model to fill.
3. **Validator drops unknown IDs** — any ID outside _this turn's_ candidate set is discarded.
4. **Every displayed figure is re-read from MongoDB** after generation.

Prose is additionally scrubbed for currency and rating claims. If everything is dropped, the
service returns an honest no-match rather than the model's confident message.

### Natural-language search

The model fills a **fixed form**; it does not write a query. Ten scalar fields are read by name
into a fresh object, so `$where`, `$ne`, `sellerId` and `status` are structurally impossible to
inject. Category names resolve through the database with escaped regex.

Search **fails open**: if the model is unavailable, the endpoint degrades to plain text search and
flags `degraded: true` rather than erroring.

### Admin assistant

Five read-only tools wrapping existing services. Unknown tool names are refused, arguments outside
the schema are ignored, limits are clamped, and the loop is capped at four iterations. Facts and
analysis are returned as **separate fields from separate sources** — `facts[]` is built from
executed tool results, `analysis` is model prose.

### Provider support

The provider auto-detects the wire format from the API key:

- `sk-ant-…` → Anthropic Messages API via the official SDK
- anything else → an OpenAI-compatible endpoint (`AI_BASE_URL`), e.g. OpenRouter

The grounding layer is identical either way; swapping providers changes transport only, never what
the model is allowed to influence.

**AI is optional.** With no key configured, the assistant endpoints return a clear
"not configured" response and natural-language search degrades to text search. Nothing crashes.

---

## Testing

```bash
npm test --prefix server   # backend
npm test --prefix client   # frontend
```

**222 backend tests across 20 suites** and **56 frontend tests across 7 suites**, all passing.
Vitest and Supertest run against an in-memory MongoDB replica set, so transactions behave as they do
in production. The backend suites include a full end-to-end order lifecycle (register → cart →
checkout → pay → fulfil → review) and the Google OAuth flow with Google stubbed at the network
boundary.

Two standing conventions:

- **Test the invariant, not the implementation**, so tests survive refactors.
- **Attack every multi-tenant feature from the wrong account**, asserting that state is _unchanged_
  rather than merely that an error came back.

`test/setup.js` awaits index creation before tests run — `$text` queries fail outright without it.

Frontend tests use Vitest with React Testing Library, and target the seams most likely to break
silently rather than a coverage number: the cart context's quantity and removal logic, the order
tracker's status-to-step mapping (including the delivered end state), the product card's stepper and
wishlist toggle, the review form's rating / submit / already-reviewed states, the AI assistant's
loading and no-match branches, and the generated product artwork's uniqueness and rotation.

> Coverage is deliberately partial. Many components are still untested; the ones that carry state
> transitions or failure handling are not.

Note on the runner: the suite is **Vitest**, not Jest. It is Jest-API compatible, and this project
is pure ESM where Jest's ESM plus module mocking is painful.

---

## CI/CD

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, and on `v*` tags.

| Job                             | What it does                                         |
| ------------------------------- | ---------------------------------------------------- |
| **Lint and format**             | `npm run lint` and `npm run format:check`            |
| **Backend tests**               | Full Vitest suite                                    |
| **Build frontend**              | Production Vite bundle                               |
| **Verify backend prod install** | `npm ci --omit=dev`, then smoke-boots the app module |
| **Build and push images**       | Docker images to GHCR — **main and tags only**       |

The first four run in parallel; image publishing depends on them and is skipped on pull requests.
The MongoDB binary (~100 MB) is cached, otherwise every run re-downloads it. Concurrency is
configured so a newer push cancels an in-flight run, except for tags, which produce released
artefacts.

> **Status:** the pipeline executes and the test, build and install jobs pass. Image publishing to
> GHCR has not been exercised end to end.

---

## Kubernetes deployment

> **Status: manifests are complete and internally consistent, but have never been applied to a
> cluster.** They are a deployment design, not a proven deployment.

`k8s/` contains namespace, ConfigMap, Secret template, backend and frontend Deployments with
Services, an HPA, a PodDisruptionBudget, and an Ingress.

Design decisions worth knowing:

- **MongoDB is deliberately external.** Running a replica set well in-cluster means an operator,
  storage classes, backup/restore and upgrade handling. The backend points at a managed cluster.
- **Three probes answer three different questions.** A startup probe allows a slow first database
  connection; liveness hits the endpoint that does _not_ touch the database, so a slow query cannot
  trigger a restart loop; readiness _does_ check the database, so a pod that cannot reach MongoDB
  leaves the load-balancer rotation while staying alive to recover.
- **Rollouts never reduce capacity** — `maxUnavailable: 0`, and replicas spread across nodes.
- The container runs non-root with a read-only root filesystem and all capabilities dropped.

### Horizontal scaling caveat

The HPA amplifies three in-process assumptions. None corrupt data, but all three behave differently
above one replica:

1. **Rate-limit buckets are per-process**, so the effective limit is roughly _N ×_ the configured
   value — login lockout and AI throttling weaken proportionally.
2. **The natural-language search cache is per-process**, so hit rate falls as replicas increase.
3. **The expired-reservation sweep runs on every replica.** It is idempotent and transactional, so
   it is safe, but it is _N ×_ the work and belongs in a single-owner CronJob at higher counts.

**Redis is the prerequisite** for scaling past ~2 replicas with these guarantees intact.

---

## Monitoring

The service emits **structured logs** and **Prometheus metrics** in-process. There is no collection
infrastructure in this repository — see [what is not here](#not-collected-here) below.

### Health

| Endpoint                | Question it answers   | Touches DB |
| ----------------------- | --------------------- | ---------- |
| `GET /api/health`       | Is the process alive? | No         |
| `GET /api/health/ready` | Can it serve traffic? | Yes        |

The split is intentional: liveness must not depend on the database, or a slow query gets the
container killed; readiness must, or traffic is routed to a pod that cannot serve it. Both are wired
to the Kubernetes probes described above.

### Logging

`pino` writes one JSON object per event to stdout — nothing writes to a file, because a stateless
service that owns log files needs volumes, rotation and disk monitoring it should not carry.

- **Every request gets an id**, returned as `x-request-id` and attached to every line emitted while
  handling it. An inbound `x-request-id` is honoured, so a trace survives a proxy. Without that
  correlation a 500 in the log cannot be tied to the request that caused it.
- **Level reflects severity**: 5xx logs at `error`, 4xx at `warn`, everything else at `info`. A 404
  is the API working as designed, not a fault.
- **Redaction is configured on the logger**, not at call sites — authorization headers, cookies,
  passwords, password hashes, tokens, API keys and the Mongo URI are censored wherever they appear.
  Secrets leak because someone logs an object they have not inspected, so the decision belongs in
  one place.
- Health checks and metric scrapes are not logged; they run every few seconds forever and would
  bury the requests a human cares about.
- `LOG_LEVEL` overrides the level. Development gets `pino-pretty`; production emits raw JSON,
  which is what a log aggregator can query.

### Metrics

`GET /metrics` serves the Prometheus text format. It sits outside `/api/v1` because it is an
operational endpoint, not part of the product API, and it is **not exposed through the public
Ingress** — metrics reveal traffic shape, error rates and internal route names.

| Metric                                         | Type      | Answers                            |
| ---------------------------------------------- | --------- | ---------------------------------- |
| `marketplace_http_request_duration_seconds`    | histogram | Rate, errors and latency per route |
| `marketplace_http_requests_in_flight`          | gauge     | Concurrency right now              |
| `marketplace_mongodb_command_duration_seconds` | histogram | Is the API slow, or the database?  |
| `marketplace_ai_requests_total`                | counter   | Model calls by outcome             |
| `marketplace_nodejs_eventloop_lag_seconds`     | gauge     | Is the process starved?            |
| `marketplace_process_resident_memory_bytes`    | gauge     | How close to the container limit   |

Two details that matter more than the list:

- **Routes are labelled by pattern, never by path** — `/api/v1/products/:productId`, not the id.
  Labelling by raw path would mint a new time series per product and exhaust the scraper. Unmatched
  paths collapse to a single `unmatched` bucket so a 404 scan cannot do the same thing.
- **MongoDB commands are timed per collection**, which is what separates "the API is slow" from
  "the database is slow" — otherwise that is guesswork.

### Not collected here

Prometheus, Grafana, Loki and Alertmanager are **not** part of this repository — the application
exposes the signals, and collecting them is a cluster concern. `k8s/` contains no `ServiceMonitor`
yet, so nothing scrapes `/metrics` in a deployed cluster. Error tracking (Sentry) is also not wired.
Both are the next infrastructure step, not something the code is waiting on.

---

## Security considerations

### Implemented

- **Helmet** security headers and an explicit **CORS allowlist**; the API refuses to start in
  production without `CLIENT_ORIGIN`, rather than failing open to `localhost`.
- **bcrypt** password hashing; the hash is never loaded into request scope.
- **JWT algorithm pinning** plus issuer/audience verification.
- **Login brute-force lockout** with a per-IP spray cap, plus a **global per-IP request ceiling**
  above every router.
- **Google OAuth login-CSRF protection** — a random `state` in an httpOnly cookie is verified on the
  callback, and the session returns in the URL fragment so it never lands in a log.
- **Secret redaction at the logger**, including the request URL — the OAuth callback's `?code=` is a
  live credential and is scrubbed before any log line is written.
- **Image URL scheme allowlist** — seller-supplied image URLs are validated against an `https:`-only
  allowlist at the boundary, closing the stored-`javascript:`/`data:` XSS vector.
- **Append-only audit log** on all six privileged mutations, written _inside_ the transaction where
  one exists, so an audit entry cannot survive a rolled-back change.
- **Idempotency enforced by unique indexes** on checkout, payments and refunds — a retry cannot
  double-charge or double-refund.
- **Server-side multi-tenant scoping** on every seller and customer resource.
- **Per-resource input validation** middleware on every mutating route.
- **AI prompt-injection resistance** — the model fills fixed forms and cannot author queries; see
  [AI architecture](#ai-architecture).
- **Secrets excluded from git and from Docker build context** via `.gitignore` and
  `.dockerignore`.

### Known open items

These are real and deliberately listed rather than hidden:

- **AI egress PII redaction** is designed but not implemented.
- **Dual source of truth on seller approval** — `Seller.status` and `user.sellerApprovalStatus` can
  in principle diverge.
- **Rate limiting is in-process**, so it weakens under horizontal scaling
  ([see caveat](#horizontal-scaling-caveat)); the same applies to the login lockout.
- **No refresh tokens** — access tokens are short-lived with no silent renewal, so a long session
  can expire mid-flow and a role change (e.g. newly-approved seller) requires re-login.
- **A live database credential was previously committed** to `server/.env.example` and pushed. The
  file is scrubbed and the credential has since been rotated, but the old value remains in git
  history. Rotation — not history rewriting — is what makes such a leak safe.

### Reporting

This is a portfolio project and not operated as a production service. Please open an issue for any
security observation.
