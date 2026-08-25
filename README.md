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

Authentication, catalog, payments, AI, and marketplace business logic are intentionally not included
in this foundation phase.