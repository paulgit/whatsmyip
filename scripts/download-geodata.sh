#!/usr/bin/env bash
# Download IP2Location LITE databases for local development
#
# Requires IP2LOCATION_TOKEN
# Get your free download token at: https://lite.ip2location.com
#
# Usage:
#   IP2LOCATION_TOKEN=your_token ./scripts/download-geodata.sh
#   npm run download-geodata   (if IP2LOCATION_TOKEN is set in .env)
#
set -euo pipefail

GEODATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/geodata"
CITY_FILE="IP2LOCATION-LITE-DB11.BIN"
ASN_FILE="IP2LOCATION-LITE-ASN.BIN"
CITY_CODE="DB11LITEBINIPV6"
ASN_CODE="DBASNLITEBINIPV6"

TOKEN="${IP2LOCATION_TOKEN:-}"

if [ -z "$TOKEN" ]; then
    # Try loading from .env if it exists
    ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
    if [ -f "$ENV_FILE" ]; then
        TOKEN="$(grep -E '^IP2LOCATION_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
    fi
fi

if [ -z "$TOKEN" ]; then
    echo "Error: IP2LOCATION_TOKEN is required."
    echo "Set it as an environment variable or in .env"
    echo "Get your free token at: https://lite.ip2location.com"
    exit 1
fi

BASE_URL="https://www.ip2location.com/download"

echo "Creating geodata directory: ${GEODATA_DIR}"
mkdir -p "$GEODATA_DIR"

download_db() {
    local file_code="$1"
    local output_name="$2"
    local tmp_file
    tmp_file="$(mktemp)"

    echo "Downloading ${file_code}..."

    local url="${BASE_URL}/?token=${TOKEN}&file=${file_code}"

    # Download to temp file
    curl -Ls --fail -o "$tmp_file" "$url"

    # Check if it's a ZIP archive and extract if so
    if unzip -q "$tmp_file" -d "${tmp_file}.d" 2>/dev/null; then
        # Find the .BIN file inside the extracted directory
        local bin_file
        bin_file="$(find "${tmp_file}.d" -maxdepth 2 -name '*.BIN' -print -quit 2>/dev/null || true)"
        if [ -n "$bin_file" ] && [ -f "$bin_file" ]; then
            mv "$bin_file" "${GEODATA_DIR}/${output_name}"
        else
            echo "Error: Could not find .BIN file inside ${file_code} archive."
            rm -rf "${tmp_file}.d"
            rm -f "$tmp_file"
            exit 1
        fi
        rm -rf "${tmp_file}.d"
    else
        # Not a ZIP — assume it's the raw .BIN file
        mv "$tmp_file" "${GEODATA_DIR}/${output_name}"
    fi

    rm -f "$tmp_file"
    local size
    size="$(du -h "${GEODATA_DIR}/${output_name}" | cut -f1 | tr -d ' ')"
    echo "  ${output_name} saved (${size})"
}

download_db "$CITY_CODE" "$CITY_FILE"
download_db "$ASN_CODE" "$ASN_FILE"

echo ""
echo "Done! IP2Location LITE databases saved to: ${GEODATA_DIR}/"
