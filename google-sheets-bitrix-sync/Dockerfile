# Multi-stage Dockerfile for NestJS Google Sheets <-> Bitrix24 Sync Service

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /usr/src/app

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY config ./config
COPY public ./public

EXPOSE 3000

CMD ["node", "dist/main"]

