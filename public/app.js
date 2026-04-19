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
    hostname: document.getElementById("hostname"),
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

      if (data.error) {
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
    // Display IP and hostname
    const ip = data.ip || "--";
    const hostname = data.hostname || "Unknown";
    const normalizedHostname = normalizeHostname(hostname);
    const hasKnownHostname = isKnownHostname(normalizedHostname);

    elements.ipAddress.textContent = ip;
    if (elements.hostname) {
      elements.hostname.textContent = hasKnownHostname
        ? normalizedHostname
        : "";
      elements.hostname.style.display = hasKnownHostname ? "block" : "none";
    }

    // Display location information if available
    if (data.city || data.region || data.country) {
      const locationParts = [];

      if (data.city) locationParts.push(data.city);
      if (data.region) locationParts.push(data.region);
      if (data.country) locationParts.push(getCountryName(data.country));

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

  /**
   * Normalize hostname into a safe trimmed string
   */
  function normalizeHostname(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /**
   * Determine whether a hostname is meaningful for display
   */
  function isKnownHostname(hostname) {
    return hostname !== "" && hostname.toLowerCase() !== "unknown";
  }

  /**
   * Get country name from country code
   * Returns the country code if name not found
   */
  function getCountryName(code) {
    const countries = {
      AF: "Afghanistan",
      AX: "Åland Islands",
      AL: "Albania",
      DZ: "Algeria",
      AS: "American Samoa",
      AD: "Andorra",
      AO: "Angola",
      AI: "Anguilla",
      AQ: "Antarctica",
      AG: "Antigua and Barbuda",
      AR: "Argentina",
      AM: "Armenia",
      AW: "Aruba",
      AU: "Australia",
      AT: "Austria",
      AZ: "Azerbaijan",
      BS: "Bahamas",
      BH: "Bahrain",
      BD: "Bangladesh",
      BB: "Barbados",
      BY: "Belarus",
      BE: "Belgium",
      BZ: "Belize",
      BJ: "Benin",
      BM: "Bermuda",
      BT: "Bhutan",
      BO: "Bolivia",
      BA: "Bosnia and Herzegovina",
      BW: "Botswana",
      BV: "Bouvet Island",
      BR: "Brazil",
      IO: "British Indian Ocean Territory",
      VG: "British Virgin Islands",
      BN: "Brunei",
      BG: "Bulgaria",
      BF: "Burkina Faso",
      BI: "Burundi",
      KH: "Cambodia",
      CM: "Cameroon",
      CA: "Canada",
      CV: "Cape Verde",
      KY: "Cayman Islands",
      CF: "Central African Republic",
      TD: "Chad",
      CL: "Chile",
      CN: "China",
      CX: "Christmas Island",
      CC: "Cocos Islands",
      CO: "Colombia",
      KM: "Comoros",
      CD: "Congo (DRC)",
      CG: "Congo (Republic)",
      CK: "Cook Islands",
      CR: "Costa Rica",
      CI: "Côte d'Ivoire",
      HR: "Croatia",
      CU: "Cuba",
      CW: "Curaçao",
      CY: "Cyprus",
      CZ: "Czech Republic",
      DK: "Denmark",
      DJ: "Djibouti",
      DM: "Dominica",
      DO: "Dominican Republic",
      EC: "Ecuador",
      EG: "Egypt",
      SV: "El Salvador",
      GQ: "Equatorial Guinea",
      ER: "Eritrea",
      EE: "Estonia",
      ET: "Ethiopia",
      FO: "Faroe Islands",
      FK: "Falkland Islands",
      FJ: "Fiji",
      FI: "Finland",
      FR: "France",
      GF: "French Guiana",
      PF: "French Polynesia",
      TF: "French Southern Territories",
      GA: "Gabon",
      GM: "Gambia",
      GE: "Georgia",
      DE: "Germany",
      GH: "Ghana",
      GI: "Gibraltar",
      GR: "Greece",
      GL: "Greenland",
      GD: "Grenada",
      GP: "Guadeloupe",
      GU: "Guam",
      GT: "Guatemala",
      GG: "Guernsey",
      GN: "Guinea",
      GW: "Guinea-Bissau",
      GY: "Guyana",
      HT: "Haiti",
      HM: "Heard Island",
      VA: "Vatican City",
      HN: "Honduras",
      HK: "Hong Kong",
      HU: "Hungary",
      IS: "Iceland",
      IN: "India",
      ID: "Indonesia",
      IR: "Iran",
      IQ: "Iraq",
      IE: "Ireland",
      IM: "Isle of Man",
      IL: "Israel",
      IT: "Italy",
      JM: "Jamaica",
      JP: "Japan",
      JE: "Jersey",
      JO: "Jordan",
      KZ: "Kazakhstan",
      KE: "Kenya",
      KI: "Kiribati",
      KP: "North Korea",
      KR: "South Korea",
      KW: "Kuwait",
      KG: "Kyrgyzstan",
      LA: "Laos",
      LV: "Latvia",
      LB: "Lebanon",
      LS: "Lesotho",
      LR: "Liberia",
      LY: "Libya",
      LI: "Liechtenstein",
      LT: "Lithuania",
      LU: "Luxembourg",
      MO: "Macao",
      MK: "North Macedonia",
      MG: "Madagascar",
      MW: "Malawi",
      MY: "Malaysia",
      MV: "Maldives",
      ML: "Mali",
      MT: "Malta",
      MH: "Marshall Islands",
      MQ: "Martinique",
      MR: "Mauritania",
      MU: "Mauritius",
      YT: "Mayotte",
      MX: "Mexico",
      FM: "Micronesia",
      MD: "Moldova",
      MC: "Monaco",
      MN: "Mongolia",
      ME: "Montenegro",
      MS: "Montserrat",
      MA: "Morocco",
      MZ: "Mozambique",
      MM: "Myanmar",
      NA: "Namibia",
      NR: "Nauru",
      NP: "Nepal",
      AN: "Netherlands Antilles",
      NL: "Netherlands",
      NC: "New Caledonia",
      NZ: "New Zealand",
      NI: "Nicaragua",
      NE: "Niger",
      NG: "Nigeria",
      NU: "Niue",
      NF: "Norfolk Island",
      MP: "Northern Mariana Islands",
      NO: "Norway",
      OM: "Oman",
      PK: "Pakistan",
      PW: "Palau",
      PS: "Palestine",
      PA: "Panama",
      PG: "Papua New Guinea",
      PY: "Paraguay",
      PE: "Peru",
      PH: "Philippines",
      PN: "Pitcairn Islands",
      PL: "Poland",
      PT: "Portugal",
      PR: "Puerto Rico",
      QA: "Qatar",
      RE: "Réunion",
      RO: "Romania",
      RU: "Russia",
      RW: "Rwanda",
      BL: "Saint Barthélemy",
      SH: "Saint Helena",
      KN: "Saint Kitts and Nevis",
      LC: "Saint Lucia",
      MF: "Saint Martin",
      PM: "Saint Pierre and Miquelon",
      VC: "Saint Vincent and the Grenadines",
      WS: "Samoa",
      SM: "San Marino",
      ST: "São Tomé and Príncipe",
      SA: "Saudi Arabia",
      SN: "Senegal",
      RS: "Serbia",
      SC: "Seychelles",
      SL: "Sierra Leone",
      SG: "Singapore",
      SX: "Sint Maarten",
      SK: "Slovakia",
      SI: "Slovenia",
      SB: "Solomon Islands",
      SO: "Somalia",
      ZA: "South Africa",
      GS: "South Georgia",
      SS: "South Sudan",
      ES: "Spain",
      LK: "Sri Lanka",
      SD: "Sudan",
      SR: "Suriname",
      SJ: "Svalbard and Jan Mayen",
      SZ: "Eswatini",
      SE: "Sweden",
      CH: "Switzerland",
      SY: "Syria",
      TW: "Taiwan",
      TJ: "Tajikistan",
      TZ: "Tanzania",
      TH: "Thailand",
      TL: "Timor-Leste",
      TG: "Togo",
      TK: "Tokelau",
      TO: "Tonga",
      TT: "Trinidad and Tobago",
      TN: "Tunisia",
      TR: "Turkey",
      TM: "Turkmenistan",
      TC: "Turks and Caicos Islands",
      TV: "Tuvalu",
      UG: "Uganda",
      UA: "Ukraine",
      AE: "United Arab Emirates",
      GB: "United Kingdom",
      US: "United States",
      UM: "U.S. Minor Outlying Islands",
      VI: "U.S. Virgin Islands",
      UY: "Uruguay",
      UZ: "Uzbekistan",
      VU: "Vanuatu",
      VE: "Venezuela",
      VN: "Vietnam",
      WF: "Wallis and Futuna",
      EH: "Western Sahara",
      YE: "Yemen",
      ZM: "Zambia",
      ZW: "Zimbabwe",
    };

    return countries[code.toUpperCase()] || code.toUpperCase();
  }

  // Start the application when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
