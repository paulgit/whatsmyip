# What’s My IP

A small Node.js/Express app that shows **your public IP address** in a clean web UI and via simple API endpoints. Optionally, it enriches the result with **IPInfo** data (location, ISP, and hostname).

- Demo: https://ip.paulg.it
- License: MIT

---

## What you get

- **Web UI**: IP (and hostname when available), location, ISP, dark/light mode toggle, copy-to-clipboard
- **API**: HTML / JSON / Text formats + dedicated endpoints
- **Optional IPInfo enrichment**: works without a token, but fewer details

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

### 3) (Optional) Enable IPInfo enrichment
Copy the template and add your IPInfo token:
```bash
cp .env.example .env
```

Edit `.env` and set:
```bash
IPINFO_TOKEN=your_token_here
```

Get a token:
- https://ipinfo.io/signup

---

## Quick start (Docker)

### Build and run (single container)
```bash
docker build -t whatsmyip .
docker run --rm -p 3000:3000 -e IPINFO_TOKEN=your_token_here whatsmyip
```

Open:
- http://localhost:3000

### Platform note (smaller images)
If you want a smaller image and you’re building on Apple Silicon, build a single platform image:
```bash
docker build --platform linux/amd64 -t whatsmyip .
```

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

If you need IPInfo enrichment, provide the env var:

```bash
IPINFO_TOKEN=your_token_here docker compose up -d
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
  "hostname": "example.com",
  "city": "San Francisco",
  "region": "California",
  "country": "US",
  "org": "AS15169 Google LLC"
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
- `GET /api/info` → `{ "ip": "…", "hostname": "…", ... }` (plus IPInfo fields when available)
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
IPINFO_TOKEN=your_token_here
DEV_IP=8.8.8.8   # optional: override detected IP during local development
```

Notes:
- Without `IPINFO_TOKEN`, the service still runs and returns your IP, but enrichment may be missing.
- IPInfo has a free tier; see https://ipinfo.io/
- `DEV_IP` is for local development only — remove it before deploying.

---

## Project structure (high level)

```text
whatsmyip/
├── server.js          # Express server + API endpoints
├── public/            # Static frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Troubleshooting

### “Geolocation data unavailable”
- Set `IPINFO_TOKEN` in `.env` (or in Docker `-e IPINFO_TOKEN=...`)
- Confirm the token is valid
- Try simulating a public IP with `x-forwarded-for` as shown above

### Port already in use
If `3000` is already taken:
- set `PORT=3001` in `.env` and restart
- or stop the process using port 3000

---

## Credits
- Geolocation data: https://ipinfo.io
- Original PHP script inspiration: https://github.com/TestoEXE/whatsmyip

---

## License
MIT — see `LICENSE`.