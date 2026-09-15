# syntax=docker/dockerfile:1

# Production-only dependency tree.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compile TypeScript.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/mriver15/getcompetitive" \
      org.opencontainers.image.description="MCP server exposing competitive Pokemon data and battle mechanics" \
      org.opencontainers.image.licenses="MIT"
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
# stdio transport: clients must run this with `docker run -i`
ENTRYPOINT ["node", "dist/index.js"]
