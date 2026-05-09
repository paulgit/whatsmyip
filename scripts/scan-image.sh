#!/usr/bin/env bash

# ---------------------------------------------------------------------------
# scan-image.sh — Scan a Docker image for vulnerabilities.
#
# Usage:
#   ./scripts/scan-image.sh <image>                    # Fail on Critical or High (trivy)
#   ./scripts/scan-image.sh <image> medium             # Fail on Critical, High, or Medium
#   ./scripts/scan-image.sh <image> --json             # Write JSON report to scan-results/
#   ./scripts/scan-image.sh <image> --sarif            # Write SARIF report to scan-results/
#   ./scripts/scan-image.sh <image> --scanner grype    # Use Grype instead of Trivy
#
# Options:
#   <image>             Docker image to scan (e.g. forgejo-mcp:2.19.0)
#   <fail-severity>     Minimum severity to fail on: critical, high (default),
#                       medium, low, negligible
#   --scanner <tool>    Vulnerability scanner to use: trivy (default) or grype
#   --json              Write a JSON report to scan-results/<scanner>-report.json
#   --sarif             Write a SARIF report to scan-results/<scanner>-report.sarif
#   --help, -h          Show this help message and exit
#
# Environment:
#   SCANNER             Override the default scanner (trivy or grype).
#   FAIL_ON             Override the fail-on severity (same as the positional
#                       argument; the argument takes precedence).
#   GRYPE_DB_AUTO_UPDATE  Set to "false" to skip Grype database updates.
#
# Exit codes:
#   0   No vulnerabilities at or above the threshold
#   1   Vulnerabilities found at or above the threshold
#   2   Script error (missing tool, bad arguments, etc.)
#
# Examples:
#   ./scripts/scan-image.sh forgejo-mcp:2.19.0
#   ./scripts/scan-image.sh forgejo-mcp:2.19.0 medium
#   ./scripts/scan-image.sh forgejo-mcp:2.19.0 --sarif
#   ./scripts/scan-image.sh forgejo-mcp:2.19.0 --scanner grype
#   FAIL_ON=critical ./scripts/scan-image.sh forgejo-mcp:2.19.0
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
    || grep -E '^#( |$)' "$0" | head -n 38 | sed 's/^# \{0,1\}//'
  exit 0
}

# ── Argument parsing ────────────────────────────────────────────────────────
IMAGE=""
FAIL_ON="${FAIL_ON:-high}"
OUTPUT_FORMAT=""
SCANNER="${SCANNER:-trivy}"

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
    --scanner)
      SCANNER="${2:?'--scanner requires a value (trivy or grype)'}"
      shift 2
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

# Validate scanner
SCANNER=$(echo "$SCANNER" | tr '[:upper:]' '[:lower:]')
case "$SCANNER" in
  trivy|grype) ;;
  *)
    error "Invalid scanner: '$SCANNER'. Must be 'trivy' or 'grype'."
    exit 2
    ;;
esac

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

# ── Prerequisite check (only for the selected scanner) ─────────────────────
if [[ "$SCANNER" == "trivy" ]]; then
  if ! command -v trivy >/dev/null 2>&1; then
    error "Trivy is not installed."
    error "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    error ""
    error "  brew install trivy          # macOS"
    error "  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin"
    exit 2
  fi
else
  if ! command -v grype >/dev/null 2>&1; then
    error "Grype is not installed."
    error "Install: https://github.com/anchore/grype#installation"
    error ""
    error "  brew install grype          # macOS"
    error "  curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin"
    exit 2
  fi
fi

# ── Map "fail-on" severity to Trivy's comma-separated format ───────────────
# Trivy reports only the listed severities, so to "fail on X and above" we
# must include all severities from X upward.
trivy_severity() {
  case "$1" in
    critical)   echo "CRITICAL" ;;
    high)       echo "HIGH,CRITICAL" ;;
    medium)     echo "MEDIUM,HIGH,CRITICAL" ;;
    low)        echo "LOW,MEDIUM,HIGH,CRITICAL" ;;
    negligible) echo "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL" ;;
  esac
}

# ── Update vulnerability database (Grype only; Trivy auto-updates) ─────────
if [[ "$SCANNER" == "grype" && "${GRYPE_DB_AUTO_UPDATE:-true}" != "false" ]]; then
  info "Updating Grype vulnerability database..."
  if ! grype db update 2>&1 | tail -1; then
    warn "Database update failed — continuing with existing database."
  fi
fi

# ── Run the scan ────────────────────────────────────────────────────────────
info "Scanner  : ${BOLD}${SCANNER}${RESET}"
info "Scanning ${CYAN}${IMAGE}${RESET}"
info "Fail-on severity: ${BOLD}${FAIL_ON}${RESET} and above"
echo ""

SCAN_EXIT_CODE=0

if [[ "$SCANNER" == "trivy" ]]; then
  TRIVY_SEVERITY=$(trivy_severity "$FAIL_ON")
  trivy image --severity "$TRIVY_SEVERITY" --exit-code 1 --format table "$IMAGE" \
    || SCAN_EXIT_CODE=$?
else
  grype "$IMAGE" --output table --fail-on "$FAIL_ON" || SCAN_EXIT_CODE=$?
fi

# ── Optional report output ──────────────────────────────────────────────────
if [[ -n "$OUTPUT_FORMAT" ]]; then
  REPORT_DIR="scan-results"
  mkdir -p "$REPORT_DIR"

  if [[ "$SCANNER" == "trivy" ]]; then
    TRIVY_SEVERITY=$(trivy_severity "$FAIL_ON")
    case "$OUTPUT_FORMAT" in
      json)
        REPORT_FILE="${REPORT_DIR}/trivy-report.json"
        trivy image --severity "$TRIVY_SEVERITY" --format json \
          --output "$REPORT_FILE" "$IMAGE"
        ;;
      sarif)
        REPORT_FILE="${REPORT_DIR}/trivy-report.sarif"
        trivy image --severity "$TRIVY_SEVERITY" --format sarif \
          --output "$REPORT_FILE" "$IMAGE"
        ;;
    esac
  else
    case "$OUTPUT_FORMAT" in
      json)
        REPORT_FILE="${REPORT_DIR}/grype-report.json"
        grype "$IMAGE" --output json --file "$REPORT_FILE"
        ;;
      sarif)
        REPORT_FILE="${REPORT_DIR}/grype-report.sarif"
        grype "$IMAGE" --output sarif --file "$REPORT_FILE"
        ;;
    esac
  fi

  if [[ -s "$REPORT_FILE" ]]; then
    info "Report written to ${CYAN}${REPORT_FILE}${RESET}"
  else
    error "Report generation failed or produced empty file: ${REPORT_FILE}"
    exit 1
  fi
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
