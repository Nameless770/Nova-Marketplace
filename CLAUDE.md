# Marketplace — Project Handoff

Complete state of the application as of **2026-09-01**. Written so a fresh session
can continue without re-deriving anything.

> **Tip:** rename or copy this to `CLAUDE.md` and Claude Code will load it
> automatically at the start of every session in this directory.

---

## 1. What this is

A multi-vendor Amazon-like marketplace built as a **modular monolith**, not
microservices. Three roles: **customer**, **seller**, **admin**.

**Stack:** React 19 + Vite (client) · Node 22 + Express 5, pure ESM (server) ·
MongoDB Atlas + Mongoose · Stripe · Anthropic SDK · Vitest + Supertest.

```
Amazon/
├── client/          React SPA (Vite)
├── server/          Express API (ESM, "type": "module")
├── k8s/             Kubernetes manifests
├── .github/workflows/ci.yml
├── docker-compose.yml
└── HANDOFF.md       this file
```

---

## 2. Run it

```bash
npm run dev                         # both, via concurrently
npm run dev --prefix server         # API  -> http://localhost:5000
npm run dev --prefix client         # SPA  -> http://localhost:5173
npm run lint                        # eslint, covers BOTH workspaces from root
npm test --prefix server            # 156 tests
npm run seed:large --prefix server  # large demo dataset (see section 5)
```

**Ports are pinned, not incidental.** `server/.env` sets
`CLIENT_ORIGIN=http://localhost:5173` and CORS is built from it; the client's
`baseURL` defaults to `http://localhost:5000/api/v1`. Running either on a
different port breaks the app with CORS errors. `.claude/launch.json` has
`autoPort: false` on both for this reason.

### Accounts — password `Password123!` for all

| Email | Role |
|---|---|
| `admin@example.com` | admin |
| `seller@example.com` | seller — Nova Supply Co (largest store) |
| `atelier@example.com`, `harbour@example.com`, `fieldnote@example.com`, `copper@example.com`, `north@example.com`, `marlow@example.com`, `kite@example.com` | sellers |
| `buyer@example.com` | customer |

Sign **out** before switching accounts — the session lives in `sessionStorage`
and visiting `/login` while signed in keeps the existing session.

---

## 3. Non-obvious invariants — read before changing anything

These are the rules the codebase actually depends on. Breaking one causes a
subtle bug, not a crash.

1. **Money is integer minor units everywhere.** `$19.99` becomes `1999`, plus a
   currency field. Every money field validates with `Number.isSafeInteger`.
   Never floats.

2. **MongoDB must be a replica set.** Seven services use
   `session.withTransaction`; standalone `mongod` does not support
   multi-document transactions. Tests use `MongoMemoryReplSet`. Docker Compose
   runs `--replSet rs0`. A naive standalone Mongo starts fine and then fails on
   the first checkout.

3. **Prices are re-read at capture.** `orderService` re-reads
   `variant.currentPriceMinor` inside the transaction rather than trusting the
   client. The cart does the same. This is the model for how untrusted input is
   handled throughout.

4. **Inventory reservation is a conditional update, not a read-then-write.**
   `quantityAvailable: { $gte: qty }` inside `findOneAndUpdate` is what prevents
   overselling under concurrency. Do not "optimise" it into a read + write.

5. **Over-refunding is structurally impossible.** Same pattern:
   `$expr: refundedMinor + amount <= amountMinor`.

6. **`paymentStatus` has FIVE values**, not four: `pending`, `paid`, `failed`,
   `partially_refunded`, `refunded`. Anything filtering on `'paid'` alone will
   silently exclude partially refunded orders. This has caused two real bugs
   already (seller analytics, review eligibility). Grep for `'paid'` before
   adding a new query.

7. **`Product.currentPriceMinor` must be set** or price-range search silently
   matches nothing. Variant products previously had only min/max, which broke
   every `maxPrice` query. `createVariant` and both seed scripts now set it.

8. **Idempotency keys are enforced by unique DB indexes**, not application
   checks — checkout, payments, refunds.

9. **AI never invents facts.** The model emits *IDs only*; the backend re-reads
   price/stock/title from MongoDB and renders those. See section 7.

10. **Seller scoping resolves from the `Seller` collection**, never from the
    denormalised `user.sellerId` (which fails open to the whole catalogue when
    unset). This was a real vulnerability, now fixed in two places.

---

## 4. Feature status

### Complete (backend + UI + tests)

Auth/registration · products & categories · search (MongoDB `$text`, cursor
pagination, facets) · cart · wishlist · checkout with coupons · orders ·
Stripe payments (webhook-confirmed) · **refunds** (partial, idempotent,
concurrency-safe) · reviews (display only) · seller dashboard (8 sections) ·
**seller product creation/editing** · admin dashboard (9 sections) ·
recommendations · audit log · rate limiting.

### Backend complete, NO UI  <-- biggest gap

| Feature | Endpoint |
|---|---|
| AI shopping assistant | `POST /api/v1/ai/shopping-assistant` |
| AI natural-language search | `POST /api/v1/ai/search` |
| AI admin analytics assistant | `POST /api/v1/ai/admin-assistant` |
| **Write a review** | `POST /api/v1/reviews/products/:id` |
| Q&A | `/api/v1/qa/*` |
| Seller coupons | `GET/POST /api/v1/coupons/seller` |
| Customer notifications | `/api/v1/notifications` (seller UI only) |
| Profile addresses / password change | `/api/v1/users/me/*` |

Customers can *read* 288 seeded reviews but cannot write one. That is the most
visible gap after the AI UI.

### Not built

Seller ledger and payouts · outbox pattern · refund reconciliation worker (a
provider outage leaves a refund `pending` forever with nothing retrying it) ·
Redis · analytics rollups · **frontend tests (zero)**.

---

## 5. Data

Database is MongoDB Atlas. **Note:** the URI has no database name, so everything
lives in a DB called `test`. Change the URI to `.../marketplace?...` and re-seed
if that bothers you.

```bash
npm run seed --prefix server              # small baseline: 10 products
npm run seed:large --prefix server        # full demo set
npm run seed:large --prefix server -- --fresh --products=600 --orders=800
```

Current contents (~3,300 docs): 10 categories · 8 sellers · 62 customers ·
320 products · 490 variants + inventory · 420 orders (347 paid) · 288 reviews ·
4 coupons. **Gross revenue $113,312.88** across 90 days.

The generator is deterministic and coherent: ratings are computed from the
reviews that exist, reviews only come from real paid orders, and dates spread
across 90 days so charts and best-seller lists have real signal. It also seeds
deliberate edge cases — 93 low-stock SKUs, sold-out items, 25 pending reviews,
draft/removed products, suspended customers.

Product images point at `picsum.photos` (external host).

---

## 6. Testing

**156 backend tests, 15 files, all passing.** Vitest + Supertest against an
in-memory replica set.

> Jest was requested at one point; the suite is **Vitest**. It is Jest-API
> compatible (same `describe`/`it`/`expect`), and this project is pure ESM where
> Jest's ESM + module mocking is painful. Porting would mostly be swapping `vi`
> for `jest`. Flagged so nobody "fixes" it by accident.

Priority is **business risk**, not coverage percentage. Two standing rules:
test the *invariant* (survives refactors), and **attack every multi-tenant
feature from the wrong account**, asserting state is unchanged rather than just
that an error came back.

`test/setup.js` awaits index creation — `$text` queries fail outright without it.

**Never change production behaviour to make a test pass.** Two tests failed
during development and both were genuine product bugs (see section 9).

---

## 7. AI layer

`server/services/ai/` — provider, prompts, schemas, grounding, candidates,
shoppingAssistant, nlSearchService, adminAssistant, adminTools, searchCriteria.

**Model:** `claude-opus-5` by default, overridable with `AI_MODEL`.

### The grounding contract

> **The model selects. The database renders.**

The model may emit entity IDs and prose. It may never emit a price, stock level,
rating, or product name that reaches a user. Enforcement is in code, four layers:

1. Retrieval-only — no product knowledge in context except tool results
2. Output schema has no price/title/stock fields to fill
3. Validator drops any ID not in **this turn's** candidate set
4. Every displayed figure re-read from MongoDB after generation

Prose is scrubbed for currency and rating claims. If everything is dropped, it
returns an honest no-match rather than the model's confident message.

**Security model for NL search:** the model fills a *fixed form*, it does not
write a query. Ten scalar fields; `validateCriteria` reads each by name into a
fresh object. `$where`, `$ne`, `sellerId`, `status` are all discarded. Category
names resolve through the DB with escaped regex.

**Admin assistant:** five read-only tools wrapping existing services. Unknown
tool names refused, args outside schema ignored, limits clamped, 4-iteration cap.
Facts and analysis are **separate response fields from separate sources** —
`facts[]` built from executed tool results, `analysis` is model prose.

### WARNING: never verified live

`ANTHROPIC_API_KEY` currently holds an **OpenRouter key** (`sk-or-v...`), not an
Anthropic key (`sk-ant-...`), so every model call 401s. AI search correctly
**fails open** to plain text search (`degraded: true`).

The grounding logic is thoroughly tested against hostile fake model output.
**Prompt quality is completely untested** — nobody knows if a real model reliably
turns "under $100" into a price filter. Get an `sk-ant-...` key and this is a
five-minute check.

Also: **prompt caching is configured but inert.** All prefixes are 250-900
tokens, below the ~1024 minimum, so every `cache_control` breakpoint is a
silent no-op.

---

## 8. Design system

Anthropic/Claude design language, from `DESIGN.md`. Tokens live in
`client/src/App.css` `:root`.

- **Canvas** `#faf9f5` (warm cream — never pure white) · **primary coral**
  `#cc785c` · **ink** `#141413` · **card** `#efe9de` · **dark surface**
  `#181715` · **hairline** `#e6dfd8`
- **Display:** Cormorant Garamond 500, `-0.02em` tracking (substitute for
  Copernicus). `h1`/`h2` only — **never bold it**.
- **Body/titles:** Inter (substitute for StyreneB). `h3` is a *title*, not
  display type, so it stays sans.
- **Radius:** 8px buttons/inputs · 12px cards · pill badges.
  **Buttons 40px tall.**
- Coral is **scarce** — CTAs and links only, never eyebrows or decoration.
- Footer is the dark surface and never inverts.

Old variable names (`--paper`, `--panel`, `--line`, `--coral`) are **aliases**
pointing at the new tokens, so legacy rules keep working.

---

## 9. Bugs found and fixed (do not reintroduce)

| Bug | Cause |
|---|---|
| Every product card showed `NaN / 5` | `ratingAverage` is `Decimal128`; `Number({$numberDecimal})` is NaN and the object is truthy so `|| 0` never fired |
| Price search matched nothing | `Product.currentPriceMinor` never set for variant products |
| Seller could not see own drafts | `GET /products/seller` used `searchProducts`, which pins `status: 'active'` |
| Seller could not fetch own draft | public `getProduct` filters to active; added `GET /products/seller/:id` |
| Partial refund removed review rights | `reviewService` filtered `paymentStatus: 'paid'` only |
| Partial refund zeroed seller revenue | same root cause in analytics |
| Admin refunds missed seller analytics | refund attributed to *initiator*; now allocated per seller |
| "Insufficient permissions" everywhere | UI offered cart/wishlist/orders to admins; those are customer-only |
| Categories not clickable | rendered as `<div>` not `<Link>` |

---

## 10. Security

Audit produced 16 findings. **Fixed:** login brute-force protection (5 failures
then lockout, per-IP spray cap, only failures count), JWT algorithm pinning plus
issuer/audience, real secret-strength validation, password hash removed from
`request.user`, `CLIENT_ORIGIN` required in production, append-only `AuditLog`
on all six privileged mutations (written *inside* the transaction where one
exists).

**Still open:** image URL scheme allowlist · AI egress PII redaction (designed,
never implemented) · dual source of truth on seller approval · global rate limit.

### WARNING: outstanding, needs a human

A **live MongoDB Atlas password was committed** to `server/.env.example` and
pushed to `origin/main`. The file is scrubbed but **it remains in git history**.
Rotation is the only real fix — history rewriting is cosmetic once the secret is
dead. Unknown whether this was done.

---

## 11. Performance

17 findings, measured. Top four:

1. **Checkout runs ~8 sequential queries per cart item inside a transaction**
   (~80 round trips for a 10-item basket, holding locks). Batch the three
   lookups into `$in` queries and the creates into `insertMany` to reach
   `N + 6`. The per-item conditional inventory update **must stay per-item**.
2. **No code splitting** — one 351 kB bundle; ~60 kB of admin/seller source
   ships to every anonymous shopper. `React.lazy` at four route groups.
3. **Prompt caching inert** (see section 7).
4. **`claude-opus-5` runs every call** including trivial extraction — route
   cheap tasks to Haiku.

Also: low-stock query uses `$expr` (cannot use an index — a deliberate
correctness trade) · no `Product.brand` index · no client-side response cache.

---

## 12. Deployment

**Docker:** multi-stage. Frontend serves `dist/` via nginx and proxies `/api`
(Vite inlines env at *build* time, so proxying keeps one image portable).
Backend on Alpine, non-root, dev deps dropped. Compose runs Mongo as a
single-node replica set initiated via healthcheck.
**WARNING: never built or run** — Docker Desktop crashes on this machine because
the username `Dell inspiron` contains a space and the Inference manager cannot
handle it. Fix: set `"EnableDockerAI": false` in
`%APPDATA%\Docker\settings-store.json`.

**CI:** `.github/workflows/ci.yml` — lint / test / build-frontend /
build-backend in parallel, then images. GHCR via `GITHUB_TOKEN`. Caches the
MongoDB binary (~100 MB otherwise re-downloaded each run). Pushes only on
main/tags. **WARNING: never executed.**

**K8s:** `k8s/` — namespace, ConfigMap, Secret template, backend + frontend
Deployments/Services/HPA/PDB, Ingress. 41 cross-reference checks pass; **never
applied to a cluster**. MongoDB is deliberately external (Atlas), not a
StatefulSet. **The HPA amplifies three in-process assumptions** — rate limit
buckets, NL-search cache, and the reservation-cleanup interval are all
per-process. Redis is the prerequisite for scaling past ~2 replicas.

---

## 13. Traps for a new session

- **Verify before claiming.** Atlas was wrongly reported as unreachable for
  several turns — it works fine via the app's own DNS override
  (`DNS_SERVERS=8.8.8.8,8.8.4.4` plus `dns.setServers`). A raw connection
  without it fails with `querySrv ECONNREFUSED`.
- Bash **heredocs break** on this setup with quoted content. Write Python/JS to
  a scratch file and run it instead.
- The browser `navigate` tool often lands on the origin, not the path, and
  creates a **fresh context that loses `sessionStorage`** (this looked like an
  auth bug and was not). Use `window.location.assign()`.
- `npm run lint | tail` **masks the exit code**. Check `$?` explicitly.
- Mongoose makes `createdAt` **immutable** — backdating needs the raw driver.
- `beforeEach(() => mock.mockReset())` returns the mock, and Vitest treats a
  returned function as a **cleanup hook**, calling it with no args after each
  test. Use braces.
- Access tokens expire in **15 minutes**; re-login mid-session.

---

## 14. Suggested next steps

1. **Frontend tests** — ~25 components, zero coverage. Every UI claim in this
   project is manual and will not survive a refactor.
2. **Review-writing UI** — 288 reviews readable, none writable.
3. **AI UI** — three finished backends with no interface. Get an `sk-ant-...`
   key first so prompts can be tuned against real output.
4. **Checkout query batching** (performance item 1) — biggest measured win.
5. **Refund reconciliation worker** — closes a gap the refund feature opened.
6. Rotate the Atlas credential if not already done.
