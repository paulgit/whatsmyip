/**
 * What's My IP Server
 * Express-based service to display external IP addresses with geolocation
 * Uses IP2Location LITE databases for local, fast lookups
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { IP2Location } = require("ip2location-nodejs");

const FLAG_ICONS_PATH = path.join(__dirname, "node_modules", "flag-icons");
const GEODATA_DIR = path.join(__dirname, "geodata");

const app = express();
const PORT = process.env.PORT || 3000;

let cityDb = null;
let asnDb = null;

/**
 * Initialise IP2Location LITE database readers
 * Loads IP2LOCATION-LITE-DB11.BIN and IP2LOCATION-LITE-ASN.BIN from the geodata directory
 */
async function initGeoIP() {
  const cityDbPath = path.join(GEODATA_DIR, "IP2LOCATION-LITE-DB11.BIN");
  const asnDbPath = path.join(GEODATA_DIR, "IP2LOCATION-LITE-ASN.BIN");

  if (fs.existsSync(cityDbPath)) {
    try {
      cityDb = new IP2Location();
      await cityDb.openAsync(cityDbPath);
      console.log("IP2Location City database loaded");
    } catch (err) {
      console.warn("IP2Location City database not available:", err.message);
      cityDb = null;
    }
  } else {
    console.warn(
      "IP2Location City database not found at " +
        cityDbPath +
        ". Run 'npm run download-geodata' to fetch the database.",
    );
  }

  if (fs.existsSync(asnDbPath)) {
    try {
      asnDb = new IP2Location();
      await asnDb.openAsync(asnDbPath);
      console.log("IP2Location ASN database loaded");
    } catch (err) {
      console.warn("IP2Location ASN database not available:", err.message);
      asnDb = null;
    }
  } else {
    console.warn("IP2Location ASN database not found at " + asnDbPath);
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
 * Return true when a field from IP2Location contains a real value.
 * The library returns sentinel strings for missing data depending on the DB tier.
 */
function isGeoField(val) {
  return val && val !== "MISSING_FILE" && val !== "-" && val !== "N/A";
}

/**
 * Look up geolocation data from local IP2Location databases
 * Synchronous lookup — typically completes in 1-5ms
 */
function getIPInfo(ip) {
  const result = {};
  let hasData = false;

  if (cityDb) {
    try {
      const city = cityDb.getAll(ip);
      if (city) {
        if (isGeoField(city.city)) { result.city = city.city; hasData = true; }
        if (isGeoField(city.region)) { result.region = city.region; hasData = true; }
        if (isGeoField(city.countryShort)) { result.country = city.countryShort; hasData = true; }
        if (isGeoField(city.countryLong)) { result.country_name = city.countryLong; hasData = true; }
        if (isGeoField(city.zipCode)) { result.postal = city.zipCode; hasData = true; }
        if (isGeoField(city.timeZone)) { result.timezone = city.timeZone; hasData = true; }
        if (isGeoField(city.latitude) && isGeoField(city.longitude)) {
          result.loc = `${city.latitude},${city.longitude}`;
          hasData = true;
        }
        if (isGeoField(city.isp)) { result.org = city.isp; hasData = true; }
      }
    } catch (err) {
      console.error("City lookup error:", err.message);
    }
  }

  if (asnDb) {
    try {
      const asn = asnDb.getAll(ip);
      if (asn) {
        if (isGeoField(asn.as)) {
          result.org = asn.as; // ASN org name preferred over city ISP; intentionally overwrites
          hasData = true;
        }
        if (isGeoField(asn.asn)) {
          result.asn = `AS${asn.asn}`;
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
      city: cityDb ? "loaded" : "unavailable",
      asn: asnDb ? "loaded" : "unavailable",
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
      `GeoIP: City ${cityDb ? "loaded" : "unavailable"}, ASN ${asnDb ? "loaded" : "unavailable"}`,
    );
  });
});
