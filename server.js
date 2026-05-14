/**
 * What's My IP Server
 * Express-based service to display external IP addresses with geolocation
 * Uses MaxMind GeoLite2 databases for local, fast lookups
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const maxmind = require("maxmind");

const FLAG_ICONS_PATH = path.join(__dirname, "node_modules", "flag-icons");
const GEODATA_DIR = path.join(__dirname, "geodata");

const app = express();
const PORT = process.env.PORT || 3000;

let cityReader = null;
let asnReader = null;

/**
 * Initialise MaxMind GeoIP database readers
 * Loads GeoLite2-City and GeoLite2-ASN .mmdb files from the geodata directory
 */
async function initGeoIP() {
  const cityDbPath = path.join(GEODATA_DIR, "GeoLite2-City.mmdb");
  const asnDbPath = path.join(GEODATA_DIR, "GeoLite2-ASN.mmdb");

  try {
    cityReader = await maxmind.open(cityDbPath);
    console.log("GeoIP City database loaded");
  } catch (err) {
    console.warn("GeoLite2-City database not available:", err.message);
    console.warn("Geolocation data will be unavailable. Run 'npm run download-geodata' to fetch the database.");
  }

  try {
    asnReader = await maxmind.open(asnDbPath);
    console.log("GeoIP ASN database loaded");
  } catch (err) {
    console.warn("GeoLite2-ASN database not available:", err.message);
  }
}

// Middleware to disable caching
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-cache, no-store, max-age=1",
    Pragma: "no-cache",
    Vary: "*",
  });
  next();
});

/**
 * Extract the real IP address from request headers
 * Handles proxies, load balancers, and CDNs
 */
function getClientIP(req) {
  if (process.env.DEV_IP) return process.env.DEV_IP;

  const headers = [
    "cf-connecting-ip",
    "x-forwarded-for",
    "x-real-ip",
    "x-cluster-client-ip",
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      const ip = value.split(",")[0].trim();

      if (isValidPublicIP(ip)) {
        return ip;
      }
    }
  }

  return req.socket.remoteAddress || req.connection.remoteAddress;
}

/**
 * Basic validation for public IP addresses
 */
function isValidPublicIP(ip) {
  if (!ip) return false;

  const cleanIP = ip.replace(/^::ffff:/, "");

  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fe80:/,
  ];

  for (const range of privateRanges) {
    if (range.test(cleanIP)) {
      return false;
    }
  }

  return true;
}

/**
 * Look up geolocation data from local MaxMind databases
 * Synchronous lookup — typically completes in 1-5ms
 */
function getIPInfo(ip) {
  const result = {};
  let hasData = false;

  if (cityReader) {
    try {
      const city = cityReader.get(ip);
      if (city) {
        if (city.city?.names?.en) {
          result.city = city.city.names.en;
          hasData = true;
        }
        if (city.subdivisions?.[0]?.names?.en) {
          result.region = city.subdivisions[0].names.en;
          hasData = true;
        }
        if (city.country?.iso_code) {
          result.country = city.country.iso_code;
          hasData = true;
        }
        if (city.country?.names?.en) {
          result.country_name = city.country.names.en;
          hasData = true;
        }
        if (city.postal?.code) {
          result.postal = city.postal.code;
          hasData = true;
        }
        if (city.location?.time_zone) {
          result.timezone = city.location.time_zone;
          hasData = true;
        }
        if (city.location?.latitude && city.location?.longitude) {
          result.loc = `${city.location.latitude},${city.location.longitude}`;
          hasData = true;
        }
      }
    } catch (err) {
      console.error("City lookup error:", err.message);
    }
  }

  if (asnReader) {
    try {
      const asn = asnReader.get(ip);
      if (asn) {
        if (asn.autonomous_system_organization) {
          result.org = asn.autonomous_system_organization;
          hasData = true;
        }
        if (asn.autonomous_system_number) {
          result.asn = `AS${asn.autonomous_system_number}`;
          hasData = true;
        }
      }
    } catch (err) {
      console.error("ASN lookup error:", err.message);
    }
  }

  return hasData ? result : null;
}

// API Endpoints

/**
 * GET / - Serve the HTML page
 */
app.get("/", async (req, res) => {
  const format = (req.query.format || "html").toLowerCase();
  const clientIP = getClientIP(req);

  if (format === "json") {
    const ipInfo = getIPInfo(clientIP);
    return res.json({
      ip: clientIP,
      ...ipInfo,
    });
  }

  if (format === "text") {
    return res.type("text/plain").send(clientIP);
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve static files from public directory (after route handlers)
app.use(express.static(path.join(__dirname, "public")));

// Serve flag-icons CSS and SVG assets
app.use("/flag-icons/css", express.static(path.join(FLAG_ICONS_PATH, "css")));
app.use(
  "/flag-icons/flags",
  express.static(path.join(FLAG_ICONS_PATH, "flags")),
);

/**
 * GET /api/ip - Get just the IP address
 */
app.get("/api/ip", (req, res) => {
  const clientIP = getClientIP(req);
  res.json({ ip: clientIP });
});

/**
 * GET /api/info - Get IP address with geolocation data
 */
app.get("/api/info", (req, res) => {
  const clientIP = getClientIP(req);
  const ipInfo = getIPInfo(clientIP);

  if (!ipInfo) {
    return res.json({
      ip: clientIP,
      error: "Geolocation data unavailable",
    });
  }

  res.json({
    ip: clientIP,
    ...ipInfo,
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    geoip: {
      city: cityReader ? "loaded" : "unavailable",
      asn: asnReader ? "loaded" : "unavailable",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
initGeoIP().then(() => {
  app.listen(PORT, () => {
    console.log(`What's My IP server running on http://localhost:${PORT}`);
    console.log(
      `GeoIP: City ${cityReader ? "loaded" : "unavailable"}, ASN ${asnReader ? "loaded" : "unavailable"}`,
    );
  });
});