#!/usr/bin/env bash

# ---------------------------------------------------------------------------
# scan-image.sh — Scan a Docker image for vulnerabilities using Grype.
#
# Usage:
#   ./scripts/scan-image.sh <image>          # Fail on Critical or High
#   ./scripts/scan-image.sh <image> medium   # Fail on Critical, High, or Medium
#   ./scripts/scan-image.sh <image> --json   # Output JSON report to stdout
#   ./scripts/scan-image.sh <image> --sarif  # Output SARIF report to stdout
#
# Options:
#   <image>             Docker image to scan (e.g. myapp:1.0.0)
#   <fail-severity>     Minimum severity to fail on: critical, high (default),
#                       medium, low, negligible
#   --json              Write a JSON report to scan-results/grype-report.json
#   --sarif             Write a SARIF report to scan-results/grype-report.sarif
#   --help, -h          Show this help message and exit
#
# Environment:
#   GRYPE_FAIL_ON       Override the fail-on severity (same as the positional
#                       argument; the argument takes precedence).
#   GRYPE_DB_AUTO_UPDATE  Set to "false" to skip database updates (useful in
#                         air-gapped environments with a pre-cached DB).
#
# Exit codes:
#   0   No vulnerabilities at or above the threshold
#   1   Vulnerabilities found at or above the threshold
#   2   Script error (missing tool, bad arguments, etc.)
#
# Examples:
#   ./scripts/scan-image.sh myapp:1.0.0
#   ./scripts/scan-image.sh myapp:1.0.0 medium
#   ./scripts/scan-image.sh myapp:1.0.0 --sarif
#   GRYPE_FAIL_ON=critical ./scripts/scan-image.sh myapp:1.0.0
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Colour helpers (disabled when stdout is not a terminal) ─────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' BOLD='' RESET=''
fi

info()  { echo -e "${GREEN}[INFO]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*" >&2; }
error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ── Usage / help ────────────────────────────────────────────────────────────
usage() {
  sed -n '/^# ---/,/^# ---/{ /^# ---/d; s/^# \{0,1\}//; p; }' "$0" 2>/dev/null \
    || grep -E '^#( |$)' "$0" | head -n 34 | sed 's/^# \{0,1\}//'
  exit 0
}

# ── Argument parsing ────────────────────────────────────────────────────────
IMAGE=""
FAIL_ON="${GRYPE_FAIL_ON:-high}"
OUTPUT_FORMAT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      ;;
    --json)
      OUTPUT_FORMAT="json"
      shift
      ;;
    --sarif)
      OUTPUT_FORMAT="sarif"
      shift
      ;;
    -*)
      error "Unknown option: $1"
      echo "Run '$0 --help' for usage." >&2
      exit 2
      ;;
    *)
      if [[ -z "$IMAGE" ]]; then
        IMAGE="$1"
      else
        # Second positional arg is the fail-on severity
        FAIL_ON="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$IMAGE" ]]; then
  error "Missing required argument: <image>"
  echo "Run '$0 --help' for usage." >&2
  exit 2
fi

# Normalise and validate severity
FAIL_ON=$(echo "$FAIL_ON" | tr '[:upper:]' '[:lower:]')
case "$FAIL_ON" in
  critical|high|medium|low|negligible) ;;
  *)
    error "Invalid severity threshold: '$FAIL_ON'"
    error "Must be one of: critical, high, medium, low, negligible"
    exit 2
    ;;
esac

# ── Prerequisite checks ────────────────────────────────────────────────────
if ! command -v grype >/dev/null 2>&1; then
  error "Grype is not installed."
  error "Install: https://github.com/anchore/grype#installation"
  error ""
  error "  brew install grype          # macOS"
  error "  curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin"
  exit 2
fi

# ── Update vulnerability database ──────────────────────────────────────────
if [[ "${GRYPE_DB_AUTO_UPDATE:-true}" != "false" ]]; then
  info "Updating Grype vulnerability database..."
  if ! grype db update 2>&1 | tail -1; then
    warn "Database update failed — continuing with existing database."
  fi
fi

# ── Run the scan ────────────────────────────────────────────────────────────
info "Scanning ${CYAN}${IMAGE}${RESET}"
info "Fail-on severity: ${BOLD}${FAIL_ON}${RESET} and above"
echo ""

SCAN_EXIT_CODE=0

# Always show the table to the terminal (or CI log)
grype "$IMAGE" --output table --fail-on "$FAIL_ON" || SCAN_EXIT_CODE=$?

# ── Optional report output ──────────────────────────────────────────────────
if [[ -n "$OUTPUT_FORMAT" ]]; then
  REPORT_DIR="scan-results"
  mkdir -p "$REPORT_DIR"

  case "$OUTPUT_FORMAT" in
    json)
      REPORT_FILE="${REPORT_DIR}/grype-report.json"
      grype "$IMAGE" --output json > "$REPORT_FILE" 2>/dev/null
      ;;
    sarif)
      REPORT_FILE="${REPORT_DIR}/grype-report.sarif"
      grype "$IMAGE" --output sarif > "$REPORT_FILE" 2>/dev/null
      ;;
  esac

  info "Report written to ${CYAN}${REPORT_FILE}${RESET}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [[ $SCAN_EXIT_CODE -eq 0 ]]; then
  info "${GREEN}${BOLD}PASS${RESET} — no vulnerabilities at or above '${FAIL_ON}' severity."
else
  error "${RED}${BOLD}FAIL${RESET} — vulnerabilities found at or above '${FAIL_ON}' severity."
  error "Review the table above and remediate before deployment."
fi

exit "$SCAN_EXIT_CODE"
