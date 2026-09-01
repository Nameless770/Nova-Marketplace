# Working in this repository

Agent-facing notes. [README.md](README.md) is the full description of the project — architecture,
features, API surface, deployment. This file holds only what is **non-obvious or easy to get
wrong**, so it stays short enough to be read every time.

---

## Commands

```bash
npm run dev                         # both services
npm run lint                        # eslint, both workspaces
npm run format:check                # prettier — CI gates on this
npm test --prefix server            # backend suite
npm test --prefix client            # frontend suite
npm run seed:large --prefix server  # full demo dataset
```

Run `lint`, `format:check` **and both test suites** before claiming work is done. CI fails on
formatting, and that gate is easy to forget.

---

## Invariants — breaking one causes a subtle bug, not a crash

1. **Money is integer minor units.** `$19.99` is `1999` plus a currency. Validated with
   `Number.isSafeInteger`. Never floats.
2. **MongoDB must be a replica set.** Seven services use `session.withTransaction`. A standalone
   `mongod` starts fine and then fails on the first checkout.
3. **Prices are re-read at capture**, inside the transaction — never trusted from the client.
4. **Inventory reservation is a conditional update.** `quantityAvailable: { $gte: qty }` inside
   `findOneAndUpdate` is what prevents overselling. Do not "optimise" it into a read-then-write.
5. **Over-refunding is blocked structurally** by `$expr: refundedMinor + amount <= amountMinor`.
6. **`paymentStatus` has five values**, not four: `pending`, `paid`, `failed`,
   `partially_refunded`, `refunded`. Filtering on `'paid'` alone silently excludes partially
   refunded orders — this has caused two real bugs. Grep before adding a query.
7. **`Product.currentPriceMinor` must be set** or price-range search silently matches nothing.
8. **Idempotency is enforced by unique DB indexes**, not application checks.
9. **AI never invents facts.** The model emits IDs only; the backend re-reads price, stock and
   title from MongoDB. See README § AI architecture.
10. **Seller scoping resolves from the `Seller` collection**, never the denormalised
    `user.sellerId`, which fails open to the whole catalogue when unset.
11. **Emit notifications after the transaction commits**, never inside it.

---

## Environment

- **The database is a local replica set**, not Atlas. Atlas refused the TLS handshake (IP not
  whitelisted / cluster paused); the URI is commented out in `server/.env`. If the app shows
  "Network Error", `mongod` has stopped — restart it:

  ```bash
  "C:\Users\Dell inspiron\.cache\mongodb-binaries\mongod-x64-win32-8.2.6.exe" --replSet rs0 --dbpath ".local-mongo/data" --port 27017 --bind_ip 127.0.0.1 --logpath ".local-mongo/mongod.log" --logappend
  ```

  The replica-set config persists in the dbpath, so it comes back with a primary on its own.

- **`server/.env` is loaded with `override: true`.** A stale exported shell variable would
  otherwise win silently — this bit us once with an `ANTHROPIC_API_KEY` left over in the shell.

- **The AI provider is chosen by key shape.** `sk-ant-…` uses the Anthropic SDK; anything else
  uses an OpenAI-compatible endpoint (`AI_BASE_URL`, default OpenRouter). Currently pointed at a
  free OpenRouter model. Grounding is identical either way.

- **Payments are cash on delivery.** `Payment.provider` is `cash` or `stripe` and the refund path
  dispatches on it: cash settles immediately, stripe waits for its webhook.

---

## Testing

Priority is **business risk**, not coverage percentage. Two standing rules:

- Test the **invariant**, so the test survives a refactor.
- **Attack every multi-tenant feature from the wrong account**, asserting state is _unchanged_
  rather than that an error came back.

`server/test/setup.js` awaits index creation — `$text` queries fail outright without it.

**Never change production behaviour to make a test pass.** Two tests failed during development and
both were genuine product bugs.

---

## Traps

- **Verify before claiming.** Several long-standing notes in this repo turned out to be wrong when
  checked against the code. Read the source, not the docs.
- Bash **heredocs break** on this setup with quoted content. Write a scratch file and run it.
- `npm run lint | tail` **masks the exit code**. Check it explicitly.
- Mongoose makes `createdAt` **immutable** — backdating needs the raw driver.
- `beforeEach(() => mock.mockReset())` returns the mock, and Vitest treats a returned function as a
  cleanup hook. Use braces.
- Access tokens expire in **15 minutes**; re-login mid-session.
- The browser `navigate` tool often lands on the origin and creates a fresh context that loses
  `sessionStorage`. Use `window.location.assign()`.
- **Renaming a field with `$rename` fails if a stale unique index still covers it** — every
  document ends up with `null` in the old key. Drop the old index first.

---

## Design system

Anthropic/Claude design language; tokens in `client/src/App.css` `:root`.

- Canvas `#faf9f5` (warm cream, never pure white) · primary coral `#cc785c` · ink `#141413` ·
  card `#efe9de` · dark surface `#181715` · hairline `#e6dfd8`
- Display: Cormorant Garamond 500, `-0.02em`. `h1`/`h2` only — **never bold it**.
- Body/titles: Inter. `h3` is a title, so it stays sans.
- Radius 8px buttons/inputs, 12px cards, pill badges. Buttons 40px tall.
- Coral is **scarce** — CTAs and links only, never decoration.
