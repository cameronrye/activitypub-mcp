# syntax=docker/dockerfile:1

# Generic container image for self-hosting the ActivityPub MCP server as a
# stdio container — pipe MCP JSON-RPC over the container's stdin/stdout
# (`docker run --rm -i activitypub-mcp`) or wrap it with a stdio<->HTTP bridge.
# Read-only by default; writes stay disabled unless ACTIVITYPUB_ENABLE_WRITES=true.
# Note: Glama builds its own image and does NOT use this file (see docs/distribution.md).

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
# stdio transport on stdin/stdout; no port is exposed. Use CMD (not ENTRYPOINT)
# so hosts that read the image's start command — e.g. Glama wrapping it with
# mcp-proxy — pick it up; an ENTRYPOINT-only image leaves Cmd empty and Glama
# reports "At least one command argument is required".
CMD ["node", "dist/mcp-main.js"]
