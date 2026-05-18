# What's My IP

A small Node.js/Express app that shows **your public IP address** in a clean web UI and via simple API endpoints. It enriches the result with **IP2Location LITE** data (city, region, country, ASN, and CIDR range) using local binary databases — no external API calls at runtime.

- Demo: https://ip.paulg.it
- License: MIT

---

## What you get

- **Web UI**: IP address, location with country flag, ASN name and CIDR range, dark/light mode toggle, copy-to-clipboard
- **API**: HTML / JSON / Text formats + dedicated endpoints
- **Local geolocation**: IP2Location LITE databases for fast, private lookups (~1-5ms)

---

## Quick start (local)

### 1) Prerequisites
- **Node.js**: use the latest stable Node (or at least Node 18+)
- **npm**

### 2) Install & run
```bash
git clone https://github.com/paulgit/whatsmyip.git
cd whatsmyip
npm install
npm run dev
```

Then open:
- http://localhost:3000

### 3) Download geolocation databases
Copy the template and add your IP2Location download token:
```bash
cp .env.example .env
```

Edit `.env` and set:
```bash
IP2LOCATION_TOKEN=your_token_here
```

Get a free token:
- https://lite.ip2location.com

Then download the databases:
```bash
npm run download-geodata
```

> The app will still run without geodata (it returns the IP address only), but location, ASN, and CIDR data won't be available.

---

## Quick start (Docker)

### Build and run (single container)
```bash
docker build -t whatsmyip .
docker run --rm -p 3000:3000 whatsmyip
```

> Geolocation databases must be baked into the image or mounted at `/app/geodata/`. See the Dockerfile for details.

Open:
- http://localhost:3000

### Platform note (smaller images)
If you want a smaller image and you’re building on Apple Silicon, build a single platform image:
```bash
docker build --platform linux/amd64 -t whatsmyip .
```


## Building with `docker-build.sh`

The preferred way to build the Docker image is via the included `docker-build.sh` script. It handles multi-platform builds, vulnerability scanning, and smart tagging based on your git state.

### Basic usage

```bash
# Local build + vulnerability scan (default: linux/amd64)
./docker-build.sh

# Build, scan, and push to the registry
./docker-build.sh --push

# Build for ARM64
./docker-build.sh --platform linux/arm64

# Multi-platform build and push
./docker-build.sh --push --platform linux/amd64,linux/arm64

# Override the registry
./docker-build.sh --registry myregistry.io/whatsmyip
```

### Build types and tagging

The script detects the git state and produces one of three build types:

| Build type | Condition | Image tag | `latest` tag? |
|:---|:---|:---|:---:|
| **Release** | Clean working tree + current commit has a git tag matching `package.json` version | `whatsmyip:1.2.3` | ✅ |
| **Dev** | Clean working tree + no matching git tag | `whatsmyip:1.2.3-dev-a1b2c3d` | ❌ |
| **Dirty** | Uncommitted changes | `whatsmyip:1.2.3-dirty-a1b2c3d` | ❌ |

**Only release builds get the `latest` tag.** This prevents unstable or in-development images from being accidentally deployed.

### Creating a release build

1. Bump the version in `package.json`
2. Commit the change
3. Create a matching git tag (strip the `v` prefix to match the version):
   ```bash
   git tag -a v1.2.3 -m "Release v1.2.3"
   ```
4. Run the build:
   ```bash
   ./docker-build.sh --push
   ```

### Vulnerability scanning

Every build is automatically scanned for vulnerabilities before any push. The scan uses `scripts/scan-image.sh` (which supports Trivy or Grype). If the scan finds issues at or above the configured severity threshold, the push is blocked.

For multi-platform builds, only the first listed platform is scanned locally. The script will warn you about this and rebuild for all platforms only if the scan passes.

---

## Docker Compose (production-like vs development)

This repo uses **Option A**:
- `docker-compose.yml` is **production-like** (no bind mounts, `NODE_ENV=production`)
- Development overrides should live in `docker-compose.dev.yml` (bind mounts, `NODE_ENV=development`, etc.)

### Production-like run with Compose
From the project root:

```bash
docker compose up -d
```

If you need to download geodata before building:

```bash
IP2LOCATION_TOKEN=your_token_here npm run download-geodata
docker compose up -d
```

### Development run with Compose overrides
Create a `docker-compose.dev.yml` (not included here) and run:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Notes:
- Avoid bind mounts in production; they override the built image and can cause drift.
- In real production, prefer deploying a versioned image tag built in CI rather than building on the server.

---

## How to use the API

Base URL below assumes local dev: `http://localhost:3000`

### Web page (HTML)
- `GET /`
- `GET /?format=html`

### JSON (IP + enrichment when available)
- `GET /?format=json`

Example:
```json
{
  "ip": "203.0.113.42",
  "city": "San Francisco",
  "region": "California",
  "country": "US",
  "country_name": "United States",
  "asn": "AS15169",
  "asn_name": "Google LLC",
  "cidr": "203.0.113.0/24"
}
```

### Plain text (IP only)
- `GET /?format=text`

Example:
```text
203.0.113.42
```

### Dedicated endpoints
- `GET /api/ip` → `{ "ip": "…" }`
- `GET /api/info` → `{ "ip": "…", "city": "…", "asn": "…", "cidr": "…", ... }` (plus IP2Location fields when available)
- `GET /health` → `{ "status": "ok", "timestamp": "…" }`

---

## Testing without deploying

You do **not** need to deploy anywhere to test this.

### 1) Manual browser test
1. Run `npm run dev`
2. Visit `http://localhost:3000`
3. Confirm:
   - IP appears
   - hostname shows **below** the IP when present
   - copy button copies the IP
   - dark mode looks correct

### 2) Validate endpoints with `curl`
Health:
```bash
curl -sS http://localhost:3000/health
```

IP only:
```bash
curl -sS http://localhost:3000/api/ip
```

Full info:
```bash
curl -sS http://localhost:3000/api/info
```

### 3) Simulate a real public IP locally
When testing on localhost you’ll often see `::1` or private addresses. Set `DEV_IP` in your `.env` to override the detected IP for all requests:

```bash
DEV_IP=8.8.8.8
```

Then restart the server. Remove or comment it out before deploying.

Alternatively, you can pass the header directly in `curl` without any code changes:

```bash
curl -sS -H "x-forwarded-for: 8.8.8.8" http://localhost:3000/api/info
```

---

## Configuration

### Environment variables
Create `.env` (optional):

```bash
PORT=3000
IP2LOCATION_TOKEN=your_token_here  # required only for npm run download-geodata
DEV_IP=8.8.8.8   # optional: override detected IP during local development
```

Notes:
- `IP2LOCATION_TOKEN` is only needed to download the geolocation databases via `npm run download-geodata`. It is not used by the app at runtime. Get a free token at https://lite.ip2location.com
- Without geodata databases, the service still runs and returns your IP, but location, ASN, and CIDR data won't be available.
- `DEV_IP` is for local development only — remove it before deploying.

---

## Project structure (high level)

```text
whatsmyip/
├── server.js          # Express server + API endpoints
├── src/
│   └── cidrLookup.js  # CIDR range calculation (BigInt-based)
├── tests/
│   └── cidrLookup.test.js
├── geodata/           # IP2Location LITE databases (downloaded separately)
├── public/            # Static frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── scripts/
│   └── download-geodata.sh
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Troubleshooting

### "Geolocation data unavailable"
- Ensure the geodata databases exist in `geodata/` — run `npm run download-geodata` (requires `IP2LOCATION_TOKEN`)
- Confirm the token is valid at https://lite.ip2location.com
- Try simulating a public IP with `x-forwarded-for` as shown above

### Port already in use
If `3000` is already taken:
- set `PORT=3001` in `.env` and restart
- or stop the process using port 3000

---

## Credits
- Geolocation data: [IP2Location LITE](https://lite.ip2location.com)
- Country flags: [flag-icons](https://github.com/lipis/flag-icons)
- Original PHP script inspiration: https://github.com/TestoEXE/whatsmyip

---

## License
MIT — see `LICENSE`.