/**
 * What's My IP Server
 * Express-based service to display external IP addresses with geolocation
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

require("dotenv").config();
const express = require("express");
const path = require("path");

const FLAG_ICONS_PATH = path.join(__dirname, "node_modules", "flag-icons");

const app = express();
const PORT = process.env.PORT || 3000;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || "";

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
    "cf-connecting-ip", // Cloudflare
    "x-forwarded-for", // Standard proxy header
    "x-real-ip", // Nginx proxy
    "x-cluster-client-ip", // Rackspace LB
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      // Handle comma-separated IPs (take the first one)
      const ip = value.split(",")[0].trim();

      // Validate it's a proper IP (not private/reserved)
      if (isValidPublicIP(ip)) {
        return ip;
      }
    }
  }

  // Fallback to socket address
  return req.socket.remoteAddress || req.connection.remoteAddress;
}

/**
 * Basic validation for public IP addresses
 * This is a simplified check - in production you might want more robust validation
 */
function isValidPublicIP(ip) {
  if (!ip) return false;

  // Remove IPv6 prefix if present
  const cleanIP = ip.replace(/^::ffff:/, "");

  // Check for private IP ranges (simplified)
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
 * Fetch geolocation data from ipinfo.io
 */
async function getIPInfo(ip) {
  if (!IPINFO_TOKEN) {
    return null;
  }

  try {
    const url = `https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`IPInfo API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching IP info:", error);
    return null;
  }
}

// API Endpoints

/**
 * GET / - Serve the HTML page
 */
app.get("/", async (req, res) => {
  const format = (req.query.format || "html").toLowerCase();
  const clientIP = getClientIP(req);

  if (format === "json") {
    const ipInfo = await getIPInfo(clientIP);
    return res.json({
      ip: clientIP,
      hostname: ipInfo?.hostname || "Unknown",
      ...ipInfo,
    });
  }

  if (format === "text") {
    return res.type("text/plain").send(clientIP);
  }

  // Default: serve HTML
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
app.get("/api/info", async (req, res) => {
  const clientIP = getClientIP(req);
  const ipInfo = await getIPInfo(clientIP);

  if (!ipInfo) {
    return res.json({
      ip: clientIP,
      hostname: "Unknown",
      error: "Geolocation data unavailable",
    });
  }

  res.json({
    ip: clientIP,
    hostname: ipInfo.hostname || "Unknown",
    ...ipInfo,
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
app.listen(PORT, () => {
  console.log(`🚀 What's My IP server running on http://localhost:${PORT}`);
  console.log(
    `📍 IPInfo token configured: ${IPINFO_TOKEN ? "Yes" : "No (geolocation disabled)"}`,
  );
});
