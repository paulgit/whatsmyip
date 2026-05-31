# AGENTS.md

This file provides guidance to when working with code in this repository.

## What This Is

A Node.js/Express web service that returns a visitor's external IP address with geolocation enrichment. Lookups use local IP2Location LITE binary databases (1–5ms, no external API calls at runtime). Supports HTML, JSON, and plain-text response formats. Runs without geolocation databases and still returns the IP.

## Commands

```bash
npm run dev          # Development server with auto-reload (Node watch mode)
npm start            # Production server
npm test             # Run tests once (Vitest)
npm run test:watch   # Vitest in watch mode
npm run lint         # Run ESLint
npm run download-geodata  # Download IP2Location LITE .BIN databases (requires IP2LOCATION_TOKEN env var)
```

Docker:
```bash
./docker-build.sh    # Smart build: auto-detects release/dev/dirty, scans with Trivy, tags correctly
docker compose up -d # Production-like compose (no bind mounts, NODE_ENV=production)
```

## Linting

ESLint with flat config (`eslint.config.mjs`). Covers `server.js`, `src/`, `tests/`, and `public/` with appropriate environments (Node.js CommonJS, ESM for tests, browser for frontend). Run with `npm run lint`. Fix all errors before committing.

## Environment Variables

See `.env.example`. Key vars:
- `PORT` — default 3000
- `NODE_ENV` — `development` or `production`
- `IP2LOCATION_TOKEN` — required only for `npm run download-geodata` (free token from lite.ip2location.com)
- `DEV_IP` — dev-only: simulate a public IP when running locally behind NAT

## Architecture

### Request flow

`server.js` is the entire backend. It:
1. Extracts the client IP from proxy headers (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, etc.) and filters out private/loopback ranges
2. Looks up geolocation in local IP2Location LITE `.BIN` databases
3. Calls `src/cidrLookup.js` to compute the CIDR prefix for the IP
4. Returns results via `/` (HTML), `/api/ip` (plain text), `/api/info` (JSON), or `/health`

### CIDR lookup (`src/cidrLookup.js`)

Custom BigInt-based CIDR calculator that replaces the ip2location-nodejs implementation, which has a bug for IPv4 addresses ≥ 128.0.0.0. All CIDR logic lives here and is covered by tests.

### Tests (`tests/cidrLookup.test.js`)

Vitest unit tests for CIDR calculation only. Covers IPv4/IPv6 conversion and edge cases including the ≥128.0.0.0 bug fix. Run a single test with:
```bash
npx vitest run tests/cidrLookup.test.js -t "test name"
```

### Frontend (`public/`)

Vanilla JS/CSS, no build step. `app.js` fetches `/api/info` and populates the page. Dark/light mode is supported.

### CI/CD (`.github/workflows/docker-publish.yml`)

Triggers on `v*.*.*` git tags. Builds for linux/amd64 + linux/arm64. Runs Trivy vulnerability scan (blocks on HIGH/CRITICAL) before pushing to the registry.
