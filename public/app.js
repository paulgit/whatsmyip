/**
 * What's My IP - Client Application
 * Handles fetching and displaying IP information with error handling
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
    copyBtn: document.getElementById("copy-btn"),
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
    elements.copyBtn.addEventListener("click", handleCopy);
    elements.retryBtn.addEventListener("click", handleRetry);

    // Theme toggle
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      const stored = localStorage.getItem("theme");
      if (stored) document.documentElement.setAttribute("data-theme", stored);
      themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const isDark = current === "dark" || (!current && prefersDark);
        const next = isDark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
      });
    }

    // Fetch IP information
    fetchIPInfo();
  }

  /**
   * Fetch IP information from the API
   */
  async function fetchIPInfo() {
    showLoading();

    try {
      const response = await fetch("/api/info", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error && !data.country) {
        throw new Error(data.error);
      }

      currentIP = data.ip;
      displayIPInfo(data);
      showMainContent();
    } catch (error) {
      console.error("Error fetching IP info:", error);
      showError(error.message || "Unable to fetch IP information");
    }
  }

  /**
   * Display IP information in the UI
   */
  function displayIPInfo(data) {
    // Display IP address
    const ip = data.ip || "--";
    elements.ipAddress.textContent = ip;

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
  }

  /**
   * Copy IP address to clipboard
   */
  async function handleCopy() {
    if (!currentIP) return;

    try {
      // Modern Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentIP);
      } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(currentIP);
      }

      showCopySuccess();
    } catch (error) {
      console.error("Failed to copy:", error);
      // Try fallback method
      try {
        fallbackCopyToClipboard(currentIP);
        showCopySuccess();
      } catch (fallbackError) {
        console.error("Fallback copy failed:", fallbackError);
        alert("Failed to copy to clipboard. Please copy manually.");
      }
    }
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
   * Show copy success feedback
   */
  function showCopySuccess() {
    const iconCopy = elements.copyBtn.querySelector(".icon-copy");
    const iconCheck = elements.copyBtn.querySelector(".icon-check");

    // Add copied state
    elements.copyBtn.classList.add("copied");
    iconCopy.classList.add("hidden");
    iconCheck.classList.remove("hidden");
    elements.copyBtn.setAttribute("aria-label", "Copied!");

    // Reset after 2 seconds
    setTimeout(() => {
      elements.copyBtn.classList.remove("copied");
      iconCopy.classList.remove("hidden");
      iconCheck.classList.add("hidden");
      elements.copyBtn.setAttribute(
        "aria-label",
        "Copy IP address to clipboard",
      );
    }, 2000);
  }

  /**
   * Handle retry button click
   */
  function handleRetry() {
    fetchIPInfo();
  }

  /**
   * Show loading state
   */
  function showLoading() {
    elements.loading.classList.remove("hidden");
    elements.error.classList.add("hidden");
    elements.mainContent.classList.add("hidden");
  }

  /**
   * Show error state
   */
  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.error.classList.remove("hidden");
    elements.loading.classList.add("hidden");
    elements.mainContent.classList.add("hidden");
  }

  /**
   * Show main content
   */
  function showMainContent() {
    elements.mainContent.classList.remove("hidden");
    elements.loading.classList.add("hidden");
    elements.error.classList.add("hidden");
  }

  // Start the application when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();