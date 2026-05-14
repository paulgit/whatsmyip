# syntax=docker/dockerfile:1.7

FROM node:24.14.1-alpine3.23 AS deps
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install curl for downloading MaxMind databases
RUN apk add --no-cache curl

# Download MaxMind GeoLite2 databases
ARG MAXMIND_LICENSE_KEY
ARG MAXMIND_ACCOUNT_ID

RUN mkdir -p /app/geodata && \
    if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
        QUERY="license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"; \
        if [ -n "$MAXMIND_ACCOUNT_ID" ]; then \
            QUERY="account_id=${MAXMIND_ACCOUNT_ID}&${QUERY}"; \
        fi; \
        BASE_URL="https://download.maxmind.com/app/geoip_download"; \
        echo "Downloading GeoLite2-City..."; \
        mkdir -p /tmp/mmdb-city && \
        curl -Ls --fail "${BASE_URL}?edition_id=GeoLite2-City&${QUERY}" | \
            tar -xz --strip-components=1 -C /tmp/mmdb-city && \
        mv /tmp/mmdb-city/GeoLite2-City.mmdb /app/geodata/ && \
        rm -rf /tmp/mmdb-city && \
        echo "Downloading GeoLite2-ASN..."; \
        mkdir -p /tmp/mmdb-asn && \
        curl -Ls --fail "${BASE_URL}?edition_id=GeoLite2-ASN&${QUERY}" | \
            tar -xz --strip-components=1 -C /tmp/mmdb-asn && \
        mv /tmp/mmdb-asn/GeoLite2-ASN.mmdb /app/geodata/ && \
        rm -rf /tmp/mmdb-asn; \
    else \
        echo "WARNING: MAXMIND_LICENSE_KEY not provided. Geolocation will be unavailable."; \
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
COPY public ./public

# The :nonroot variant already runs as UID 65532 (non-root), so no explicit USER needed

# Expose port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]

CMD ["server.js"]