# syntax=docker/dockerfile:1

# Container image for the ActivityPub MCP server, primarily for Glama-style
# hosting that runs each server as a stdio container and bridges it to
# SSE / Streamable HTTP. Read-only by default; writes stay disabled unless
# ACTIVITYPUB_ENABLE_WRITES=true is supplied at runtime.

# --- Build stage: install all deps and compile TypeScript to dist/. ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps + built output only. ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    MCP_TRANSPORT_MODE=stdio
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
# stdio transport on stdin/stdout; no port is exposed.
ENTRYPOINT ["node", "dist/mcp-main.js"]
