# syntax=docker/dockerfile:1.7

FROM node:24.14.1-alpine3.23 AS deps
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install curl, unzip, and bash for downloading IP2Location databases (if needed)
RUN apk add --no-cache curl unzip bash

# Download IP2Location LITE databases only if not already present
ARG IP2LOCATION_TOKEN

# Copy local geodata if present (avoids rate-limited downloads on rebuild)
COPY geodata/ /app/geodata/
COPY scripts/download-geodata.sh ./scripts/download-geodata.sh

RUN mkdir -p /app/geodata && \
    if [ -f /app/geodata/IP2LOCATION-LITE-DB11.BIN ] && [ -f /app/geodata/IP2LOCATION-LITE-ASN.BIN ]; then \
        echo "Using local geodata files (skipping download)"; \
    elif [ -n "$IP2LOCATION_TOKEN" ]; then \
        /app/scripts/download-geodata.sh; \
    else \
        echo "WARNING: IP2LOCATION_TOKEN not provided and no local geodata found. Geolocation will be unavailable."; \
        touch /app/geodata/.no-data; \
    fi

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

ARG ENV_APP_VERSION=0.0.0
ENV APP_VERSION=${ENV_APP_VERSION}

# Copy only runtime essentials
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/geodata ./geodata
COPY server.js ./server.js
COPY src ./src
COPY public ./public

# The :nonroot variant already runs as UID 65532 (non-root), so no explicit USER needed

# Expose port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]

CMD ["server.js"]
