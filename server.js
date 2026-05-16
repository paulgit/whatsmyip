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
        if (
          city.city &&
          city.city !== "MISSING_FILE" &&
          city.city !== "-" &&
          city.city !== "N/A"
        ) {
          result.city = city.city;
          hasData = true;
        }
        if (
          city.region &&
          city.region !== "MISSING_FILE" &&
          city.region !== "-" &&
          city.region !== "N/A"
        ) {
          result.region = city.region;
          hasData = true;
        }
        if (
          city.countryShort &&
          city.countryShort !== "MISSING_FILE" &&
          city.countryShort !== "-" &&
          city.countryShort !== "N/A"
        ) {
          result.country = city.countryShort;
          hasData = true;
        }
        if (
          city.countryLong &&
          city.countryLong !== "MISSING_FILE" &&
          city.countryLong !== "-" &&
          city.countryLong !== "N/A"
        ) {
          result.country_name = city.countryLong;
          hasData = true;
        }
        if (
          city.zipCode &&
          city.zipCode !== "MISSING_FILE" &&
          city.zipCode !== "-" &&
          city.zipCode !== "N/A"
        ) {
          result.postal = city.zipCode;
          hasData = true;
        }
        if (
          city.timeZone &&
          city.timeZone !== "MISSING_FILE" &&
          city.timeZone !== "-" &&
          city.timeZone !== "N/A"
        ) {
          result.timezone = city.timeZone;
          hasData = true;
        }
        if (
          city.latitude &&
          city.latitude !== "" &&
          city.latitude !== "MISSING_FILE" &&
          city.latitude !== "-" &&
          city.latitude !== "N/A" &&
          city.longitude &&
          city.longitude !== "" &&
          city.longitude !== "MISSING_FILE" &&
          city.longitude !== "-" &&
          city.longitude !== "N/A"
        ) {
          result.loc = `${city.latitude},${city.longitude}`;
          hasData = true;
        }
        if (
          city.isp &&
          city.isp !== "MISSING_FILE" &&
          city.isp !== "-" &&
          city.isp !== "N/A"
        ) {
          result.org = city.isp;
          hasData = true;
        }
      }
    } catch (err) {
      console.error("City lookup error:", err.message);
    }
  }

  if (asnDb) {
    try {
      const asn = asnDb.getAll(ip);
      if (asn) {
        if (
          asn.as &&
          asn.as !== "MISSING_FILE" &&
          asn.as !== "-" &&
          asn.as !== "N/A"
        ) {
          result.org = asn.as;
          hasData = true;
        }
        if (
          asn.asn &&
          asn.asn !== "MISSING_FILE" &&
          asn.asn !== "-" &&
          asn.asn !== "N/A"
        ) {
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
