#!/usr/bin/env bash
# Download MaxMind GeoLite2 databases for local development
#
# Requires MAXMIND_LICENSE_KEY (and optionally MAXMIND_ACCOUNT_ID)
# Get your free license key at: https://www.maxmind.com/en/geolite2/signup
#
# Usage:
#   MAXMIND_LICENSE_KEY=your_key ./scripts/download-geodata.sh
#   npm run download-geodata   (if MAXMIND_LICENSE_KEY is set in .env)
#
set -euo pipefail

GEODATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/geodata"
CITY_EDITION="GeoLite2-City"
ASN_EDITION="GeoLite2-ASN"

LICENSE_KEY="${MAXMIND_LICENSE_KEY:-}"
ACCOUNT_ID="${MAXMIND_ACCOUNT_ID:-}"

if [ -z "$LICENSE_KEY" ]; then
    # Try loading from .env if it exists
    ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
    if [ -f "$ENV_FILE" ]; then
        LICENSE_KEY="$(grep -E '^MAXMIND_LICENSE_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
        ACCOUNT_ID="$(grep -E '^MAXMIND_ACCOUNT_ID=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
    fi
fi

if [ -z "$LICENSE_KEY" ]; then
    echo "Error: MAXMIND_LICENSE_KEY is required."
    echo "Set it as an environment variable or in .env"
    echo "Get your free license key at: https://www.maxmind.com/en/geolite2/signup"
    exit 1
fi

# Build query parameters
QUERY_PARAMS="license_key=${LICENSE_KEY}"
if [ -n "$ACCOUNT_ID" ]; then
    QUERY_PARAMS="account_id=${ACCOUNT_ID}&${QUERY_PARAMS}"
fi

BASE_URL="https://download.maxmind.com/app/geoip_download"

echo "Creating geodata directory: ${GEODATA_DIR}"
mkdir -p "$GEODATA_DIR"

download_and_extract() {
    local edition="$1"
    local output_file="${GEODATA_DIR}/${edition}.mmdb"
    local tmp_dir
    tmp_dir="$(mktemp -d)"

    echo "Downloading ${edition}..."

    local url="${BASE_URL}?edition_id=${edition}&${QUERY_PARAMS}&suffix=tar.gz"

    # Download and extract the .mmdb file from the tar.gz
    # --strip-components=1 removes the date-prefixed directory from the archive
    curl -Ls --fail "$url" | tar -xz --strip-components=1 -C "$tmp_dir"

    if [ ! -f "${tmp_dir}/${edition}.mmdb" ]; then
        echo "Error: Failed to extract ${edition}.mmdb from archive."
        rm -rf "$tmp_dir"
        exit 1
    fi

    mv "${tmp_dir}/${edition}.mmdb" "$output_file"
    rm -rf "$tmp_dir"
    local size
    size="$(du -h "$output_file" | cut -f1 | tr -d ' ')"
    echo "  ${edition}.mmdb saved (${size})"
}

download_and_extract "$CITY_EDITION"
download_and_extract "$ASN_EDITION"

echo ""
echo "Done! GeoLite2 databases saved to: ${GEODATA_DIR}/"