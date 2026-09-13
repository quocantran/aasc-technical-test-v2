# syntax=docker/dockerfile:1.4

# ==============================================================================
# Stage 1: Build TypeScript code and prepare production dependencies
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies using BuildKit cache mount (runs sqlite3 prebuild install)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

COPY . .

# Compile TypeScript source code into dist directory
RUN npm run build

# Prune development dependencies to keep only production packages
RUN npm prune --omit=dev


# ==============================================================================
# Stage 2: Minimal, secure and ultra-fast production runtime environment
# ==============================================================================
FROM node:22-alpine AS production

WORKDIR /usr/src/app

# Install tini as PID 1 init process, wget for healthchecks, and tzdata
RUN apk add --no-cache tini wget tzdata

# Set production environment variables and timezone
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Ho_Chi_Minh

# Copy production dependencies, compiled output, and static assets directly.
# NOTE: Standard Linux permissions (0755/0644) give user 'node' read/execute access natively.
# Omitting --chown avoids recursively rewriting metadata on tens of thousands of files.
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./
COPY config ./config
COPY public ./public

# Pre-create writable data directory and assign ownership to node user for SQLite storage
RUN mkdir -p data && chown -R node:node data

# Switch to non-root user for security compliance
USER node

EXPOSE 3000

# Healthcheck using wget against health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use tini as entrypoint to properly handle signals and reap processes
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/main"]

