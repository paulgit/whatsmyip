# syntax=docker/dockerfile:1.7

FROM node:24.14.1-alpine3.23 AS deps
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.14.1-alpine3.23 AS runner

# Patch OS-level CVEs and remove npm/npx/corepack (not needed at runtime)
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

ARG ENV_APP_VERSION=0.0.0
ENV APP_VERSION=${ENV_APP_VERSION}

# Copy only runtime essentials
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY server.js ./server.js
COPY public ./public

# Run as the built-in non-root node user for security
USER node

# Expose port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]

CMD ["node", "server.js"]
