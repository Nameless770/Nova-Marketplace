# syntax=docker/dockerfile:1

# ---------- build stage ----------
# bcrypt is a native module compiled against libc, so the builder and the
# runtime must share a base image. Both are Alpine; only this stage carries the
# toolchain needed to compile it.
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
# Production dependencies only — the compiled output is copied into the runtime
# image, so dev tooling (vitest, mongodb-memory-server) never ships.
RUN npm ci --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# wget is used by the container health check.
RUN apk add --no-cache wget

COPY --from=build /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node . .

# Anything that only matters for local development or testing.
RUN rm -rf test vitest.config.js .env

# node:alpine ships an unprivileged `node` user; running as root in a container
# that talks to a database is an unnecessary risk.
USER node

EXPOSE 5000

# Readiness, not liveness: this reports unhealthy while MongoDB is unreachable,
# which is what should keep traffic away from the container.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health/ready || exit 1

# Node is PID 1 here and server.js already installs SIGTERM/SIGINT handlers that
# close the HTTP server and disconnect Mongo, so shutdown is graceful without an
# init shim.
CMD ["node", "server.js"]
