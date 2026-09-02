# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Dev dependencies are required here: Vite is the build tool.
RUN npm ci

COPY . .

# Vite inlines env vars at build time. A relative base URL keeps the resulting
# image environment-independent — nginx proxies /api to the backend, so the
# same image works in any environment without a rebuild.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- runtime stage ----------
# Only the compiled assets survive: no Node, no node_modules, no source.
FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
