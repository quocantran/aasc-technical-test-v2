# syntax=docker/dockerfile:1.4

# ==============================================================================
# Stage 1: Build TypeScript code and prepare production dependencies
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies using BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

COPY . .

# Generate Prisma Client and compile TypeScript into dist directory
RUN npx prisma generate
RUN npm run build

# Prune development dependencies to keep only production packages
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Minimal and secure production runtime environment
# ==============================================================================
FROM node:22-alpine AS production

WORKDIR /usr/src/app

# Install tini as PID 1 init process, wget for healthchecks, and tzdata
RUN apk add --no-cache tini wget tzdata

# Set production environment variables and timezone
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Ho_Chi_Minh

# Copy production dependencies, compiled output, prisma schema, and swagger docs with correct ownership
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node --from=builder /usr/src/app/prisma ./prisma
COPY --chown=node:node --from=builder /usr/src/app/docs ./docs
COPY --chown=node:node package*.json ./

# Switch to non-root user for security
USER node

EXPOSE 3000

# Healthcheck using wget against terminus health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

# Use tini as entrypoint to properly handle signals and reap processes
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/main"]
