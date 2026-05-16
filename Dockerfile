# syntax=docker/dockerfile:1.7

FROM node:24.14.1-alpine3.23 AS deps
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install curl and unzip for downloading IP2Location databases
RUN apk add --no-cache curl unzip

# Download IP2Location LITE databases
ARG IP2LOCATION_TOKEN

RUN mkdir -p /app/geodata && \
    if [ -n "$IP2LOCATION_TOKEN" ]; then \
        BASE_URL="https://www.ip2location.com/download"; \
        \
        echo "Downloading IP2LOCATION-LITE-DB11..."; \
        curl -Ls --fail -o /tmp/city.bin "${BASE_URL}/?token=${IP2LOCATION_TOKEN}&file=DB11LITEBINIPV6" && \
        if unzip -t /tmp/city.bin >/dev/null 2>&1; then \
            unzip -q /tmp/city.bin -d /tmp/city && \
            find /tmp/city -maxdepth 2 -name '*.BIN' -exec mv {} /app/geodata/IP2LOCATION-LITE-DB11.BIN \; && \
            rm -rf /tmp/city; \
        else \
            mv /tmp/city.bin /app/geodata/IP2LOCATION-LITE-DB11.BIN; \
        fi && \
        rm -f /tmp/city.bin && \
        if [ ! -f /app/geodata/IP2LOCATION-LITE-DB11.BIN ]; then \
            echo "ERROR: IP2LOCATION-LITE-DB11.BIN was not created."; exit 1; \
        fi && \
        echo "  IP2LOCATION-LITE-DB11.BIN OK"; \
        \
        echo "Downloading IP2LOCATION-LITE-ASN..."; \
        curl -Ls --fail -o /tmp/asn.bin "${BASE_URL}/?token=${IP2LOCATION_TOKEN}&file=DBASNLITEBINIPV6" && \
        if unzip -t /tmp/asn.bin >/dev/null 2>&1; then \
            unzip -q /tmp/asn.bin -d /tmp/asn && \
            find /tmp/asn -maxdepth 2 -name '*.BIN' -exec mv {} /app/geodata/IP2LOCATION-LITE-ASN.BIN \; && \
            rm -rf /tmp/asn; \
        else \
            mv /tmp/asn.bin /app/geodata/IP2LOCATION-LITE-ASN.BIN; \
        fi && \
        rm -f /tmp/asn.bin && \
        if [ ! -f /app/geodata/IP2LOCATION-LITE-ASN.BIN ]; then \
            echo "ERROR: IP2LOCATION-LITE-ASN.BIN was not created."; exit 1; \
        fi && \
        echo "  IP2LOCATION-LITE-ASN.BIN OK"; \
    else \
        echo "WARNING: IP2LOCATION_TOKEN not provided. Geolocation will be unavailable."; \
        touch /app/geodata/.no-data; \
    fi && \
    ls -la /app/geodata/

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
