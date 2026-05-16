/**
 * What's My IP - Client Application
 * Two-phase rendering: IP displayed immediately, geolocation loaded async
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

(function () {
  "use strict";

  // DOM Elements
  const elements = {
    loading: document.getElementById("loading"),
    error: document.getElementById("error"),
    errorMessage: document.getElementById("error-message"),
    retryBtn: document.getElementById("retry-btn"),
    mainContent: document.getElementById("main-content"),
    ipAddress: document.getElementById("ip-address"),
    ipLive: document.getElementById("ip-live"),
    asnDisplay: document.getElementById("asn-display"),
    asnValue: document.getElementById("asn-value"),
    asnName: document.getElementById("asn-name"),
    cidrValue: document.getElementById("cidr-value"),
    location: document.getElementById("location"),
    isp: document.getElementById("isp"),
    locationInfo: document.getElementById("location-info"),
    flagBg: document.getElementById("flag-bg"),
  };

  // State
  let currentIP = "";

  /**
   * Initialize the application
   */
  function init() {
    // Set up event listeners
    elements.ipAddress.addEventListener("click", handleCopyIP);
    elements.ipAddress.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCopyIP();
      }
    });

    elements.asnValue.addEventListener("click", handleCopyASN);
    elements.asnValue.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCopyASN();
      }
    });

    elements.cidrValue.addEventListener("click", handleCopyCIDR);
    elements.cidrValue.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCopyCIDR();
      }
    });

    elements.retryBtn.addEventListener("click", handleRetry);

    // Theme toggle
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      const stored = localStorage.getItem("theme");
      if (stored) document.documentElement.setAttribute("data-theme", stored);
      themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        const isDark = current === "dark" || (!current && prefersDark);
        const next = isDark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
      });
    }

    // Fetch IP information (two-phase: IP first, then geolocation)
    fetchIPInfo();
  }

  /**
   * Two-phase fetch: get IP immediately, then load geolocation data
   *
   * Phase 1: /api/ip — instant, no database lookup needed
   * Phase 2: /api/info — local IP2Location lookup (~1-5ms), fills in location/ISP/flag
   */
  async function fetchIPInfo() {
    showLoading();

    // Fire both requests concurrently
    const ipPromise = fetchIP();
    const infoPromise = fetchGeoInfo();

    // Phase 1: Display IP address as soon as it's available
    try {
      const ipData = await ipPromise;
      currentIP = ipData.ip || "--";
      elements.ipAddress.textContent = currentIP;
      elements.ipLive.textContent = currentIP;

      // Show main content with IP; location shows shimmer placeholders
      showMainContent();
    } catch (error) {
      console.error("Error fetching IP:", error);
      showError(error.message || "Unable to detect your IP address");
      return;
    }

    // Phase 2: Fill in geolocation when it resolves
    try {
      const infoData = await infoPromise;
      displayGeoInfo(infoData);
    } catch (error) {
      console.error("Error fetching geolocation:", error);
      // IP is still visible; just hide the location section
      hideGeoPlaceholders();
      elements.locationInfo.style.display = "none";
    }
  }

  /**
   * Fetch just the IP address from /api/ip
   */
  async function fetchIP() {
    const response = await fetch("/api/ip", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch geolocation data from /api/info
   */
  async function fetchGeoInfo() {
    const response = await fetch("/api/info", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error && !data.country) {
      throw new Error(data.error);
    }

    return data;
  }

  /**
   * Display geolocation information in the UI
   */
  function displayGeoInfo(data) {
    // Display location information if available
    if (data.city || data.region || data.country) {
      const locationParts = [];

      if (data.city) locationParts.push(data.city);
      if (data.region) locationParts.push(data.region);
      if (data.country_name || data.country) {
        locationParts.push(data.country_name || data.country);
      }

      const locationText = locationParts.join(", ") || "Unknown";

      // Set full-page flag background and inline flag icon
      if (data.country && elements.flagBg) {
        const raw = data.country.toLowerCase();
        const cc = /^[a-z]{2}$/.test(raw) ? raw : null;
        if (cc) {
          elements.flagBg.className = `flag-bg fib fi-${cc}`;
          elements.flagBg.classList.add("flag-bg--visible");
          const flag = document.createElement("span");
          flag.className = `location-flag fi fi-${cc}`;
          flag.setAttribute("aria-hidden", "true");
          const text = document.createElement("span");
          text.className = "location-text";
          text.textContent = locationText;
          elements.location.replaceChildren(flag, text);
        } else {
          elements.location.textContent = locationText;
        }
      } else {
        elements.location.textContent = locationText;
      }

      elements.locationInfo.style.display = "block";
    } else {
      elements.locationInfo.style.display = "none";
    }

    // Display ISP information
    if (data.org) {
      elements.isp.textContent = data.org;
    } else {
      elements.isp.textContent = "Unknown";
    }

    // Display ASN information
    if (data.asn) {
      elements.asnValue.textContent = data.asn;
      elements.asnName.textContent = data.asn_name ? ` ${data.asn_name}` : "";
      if (data.cidr) {
        elements.cidrValue.textContent = data.cidr;
        elements.cidrValue.classList.remove("hidden");
      } else {
        elements.cidrValue.classList.add("hidden");
      }
      elements.asnDisplay.classList.remove("hidden");
    } else {
      elements.asnDisplay.classList.add("hidden");
    }

    // Remove shimmer placeholders once data is loaded
    elements.location.classList.remove("info-value--loading");
    elements.isp.classList.remove("info-value--loading");
  }

  /**
   * Remove shimmer effect from geo placeholders when geo data is unavailable
   */
  function hideGeoPlaceholders() {
    elements.location.classList.remove("info-value--loading");
    elements.isp.classList.remove("info-value--loading");
  }

  /**
   * Copy IP address to clipboard
   */
  async function handleCopyIP() {
    await copyText(currentIP, elements.ipAddress);
  }

  /**
   * Copy ASN to clipboard
   */
  async function handleCopyASN() {
    const asn = elements.asnValue.textContent;
    if (!asn || asn === "--" || asn === "Unknown") return;
    await copyText(asn, elements.asnValue);
  }

  /**
   * Copy CIDR range to clipboard
   */
  async function handleCopyCIDR() {
    const cidr = elements.cidrValue.textContent;
    if (!cidr) return;
    await copyText(cidr, elements.cidrValue);
  }

  /**
   * Fallback copy method for older browsers
   */
  function fallbackCopyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      if (!successful) throw new Error("Copy command failed");
    } finally {
      document.body.removeChild(textArea);
    }
  }

  /**
   * Copy text to clipboard and show feedback on the element
   * @param {string} text - Text to copy
   * @param {HTMLElement} element - Element to show feedback on
   */
  async function copyText(text, element) {
    if (!text) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopyToClipboard(text);
      }
      showCopySuccess(element);
    } catch (error) {
      console.error("Failed to copy:", error);
      try {
        fallbackCopyToClipboard(text);
        showCopySuccess(element);
      } catch (fallbackError) {
        console.error("Fallback copy failed:", fallbackError);
        alert("Failed to copy to clipboard. Please copy manually.");
      }
    }
  }

  /**
   * Show copy success feedback on an element
   * @param {HTMLElement} element
   */
  function showCopySuccess(element) {
    const originalTitle = element.getAttribute("title");

    element.classList.add("copied");
    element.setAttribute("title", "Copied!");

    setTimeout(() => {
      element.classList.remove("copied");
      element.setAttribute("title", "Click to copy");
    }, 2000);
  }

  /**
   * Handle retry button click
   */
  function handleRetry() {
    fetchIPInfo();
  }

  /**
   * Show loading state — full skeleton with shimmer on geo placeholders
   */
  function showLoading() {
    elements.loading.classList.remove("hidden");
    elements.error.classList.add("hidden");
    elements.mainContent.classList.add("hidden");

    // Add shimmer to geo value placeholders
    elements.location.classList.add("info-value--loading");
    elements.isp.classList.add("info-value--loading");
  }

  /**
   * Show error state
   */
  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.error.classList.remove("hidden");
    elements.loading.classList.add("hidden");
    elements.mainContent.classList.add("hidden");
    elements.asnDisplay.classList.add("hidden");
  }

  /**
   * Show main content — IP is displayed, geo may still be loading
   */
  function showMainContent() {
    elements.mainContent.classList.remove("hidden");
    elements.loading.classList.add("hidden");
    elements.error.classList.add("hidden");
    // Keep ASN hidden until geo data confirms it exists
    elements.asnDisplay.classList.add("hidden");
  }

  // Start the application when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
