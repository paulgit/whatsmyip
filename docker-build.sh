#!/usr/bin/env bash

# ---------------------------------------------------------------------------
# docker-build.sh — Build, scan, and optionally push the Docker image.
#
# The image is always built locally and scanned for vulnerabilities before
# any push.  A push is blocked if the scan finds issues at or above the
# configured severity threshold.
#
# Build types:
#   release  — Clean working tree, current commit has an exact git tag matching
#              package.json version. Tags: <version> + latest.
#   dev      — Clean working tree, no matching git tag. Tag: <version>-dev-<sha>.
#   dirty    — Uncommitted changes. Tag: <version>-dirty-<sha>.
#
# Usage:
#   ./docker-build.sh [OPTIONS]
#
# Options:
#   --push              Push the image to the registry after a clean scan.
#   --platform <arch>   Target platform (default: linux/amd64).
#                       Supports any value accepted by `docker buildx --platform`.
#                       Multi-platform (comma-separated) is supported with --push;
#                       the scan always uses the first listed platform.
#   --registry <url>    Override the default image registry/repo prefix.
#   --help              Show this help message and exit.
#
# Examples:
#   ./docker-build.sh                            # Local build + scan, linux/amd64
#   ./docker-build.sh --push                     # Build, scan, and push
#   ./docker-build.sh --platform linux/arm64     # Local ARM64 build + scan
#   ./docker-build.sh --push --platform linux/amd64,linux/arm64  # Multi-arch push
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load .env if available (docker compose does this automatically, but
#    bare docker build does not) ──────────────────────────────────────────────
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  # Only export variables that aren't already set in the environment.
  # This reads KEY=VALUE lines (ignoring comments and blanks) and exports them.
  while IFS='=' read -r key value; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    # Strip surrounding quotes from value
    value="${value#\"}" ; value="${value%\"}"
    value="${value#\'}" ; value="${value%\'}"
    # Don't override values already in the environment
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")
fi

# ── Defaults ────────────────────────────────────────────────────────────────
IMAGE_REGISTRY="code.paulg.it/paulgit/whatsmyip"
TARGET_PLATFORM="linux/amd64"
PUSH=false

# ── Colour helpers (disabled when stdout is not a terminal) ─────────────────
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  YELLOW=$'\033[0;33m'
  GREEN=$'\033[0;32m'
  CYAN=$'\033[0;36m'
  RESET=$'\033[0m'
  info()  { printf "${GREEN}[INFO]${RESET}  %s\n" "$*"; }
  warn()  { printf "${YELLOW}[WARN]${RESET}  %s\n" "$*" >&2; }
  error() { printf "${RED}[ERROR]${RESET} %s\n" "$*" >&2; }
else
  RED='' YELLOW='' GREEN='' CYAN='' RESET=''
  info()  { echo "[INFO]  $*"; }
  warn()  { echo "[WARN]  $*" >&2; }
  error() { echo "[ERROR] $*" >&2; }
fi

# ── Usage / help ────────────────────────────────────────────────────────────
usage() {
  grep -E '^#( |$)' "$0" | head -n 23 | sed 's/^# \{0,1\}//'
  echo ""
  exit 0
}

# ── Argument parsing ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH=true
      shift
      ;;
    --platform)
      TARGET_PLATFORM="${2:?'--platform requires a value (e.g. linux/amd64)'}"
      shift 2
      ;;
    --registry)
      IMAGE_REGISTRY="${2:?'--registry requires a value'}"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    *)
      error "Unknown option: $1"
      echo "Run '$0 --help' for usage." >&2
      exit 1
      ;;
  esac
done

# ── Prerequisite checks ────────────────────────────────────────────────────
missing=()
command -v node   >/dev/null 2>&1 || missing+=("node")
command -v docker >/dev/null 2>&1 || missing+=("docker")
command -v git    >/dev/null 2>&1 || missing+=("git")

if [[ ${#missing[@]} -gt 0 ]]; then
  error "Missing required tool(s): ${missing[*]}"
  exit 1
fi

# Verify Docker Buildx is available
if ! docker buildx version >/dev/null 2>&1; then
  error "Docker Buildx is required but not available."
  error "See https://docs.docker.com/build/buildx/install/"
  exit 1
fi

# ── Gather metadata ────────────────────────────────────────────────────────
APP_VERSION=$(node -p "require('./package.json').version")
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null | sed 's/^v//' || true)

# Determine build type and image tag
IS_DIRTY=false
if [[ $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') -ne 0 ]]; then
  IS_DIRTY=true
fi

if ${IS_DIRTY}; then
  BUILD_TYPE="dirty"
  IMAGE_TAG="${IMAGE_REGISTRY}:${APP_VERSION}-dirty-${GIT_SHA}"
  warn "Git working tree is dirty — this is a ${YELLOW}dirty${RESET} build."
elif [[ "${GIT_TAG}" == "${APP_VERSION}" ]]; then
  BUILD_TYPE="release"
  IMAGE_TAG="${IMAGE_REGISTRY}:${APP_VERSION}"
else
  BUILD_TYPE="dev"
  IMAGE_TAG="${IMAGE_REGISTRY}:${APP_VERSION}-dev-${GIT_SHA}"
  warn "No matching git tag for v${APP_VERSION} — this is a ${YELLOW}dev${RESET} build."
fi

# ── Shared OCI labels ────────────────────────────────────────────────────────
IS_MULTIPLATFORM=false
[[ "${TARGET_PLATFORM}" == *","* ]] && IS_MULTIPLATFORM=true

# For the local build (needed for scanning), always use a single platform.
# Multi-platform images cannot be loaded into the local daemon.
SCAN_PLATFORM="${TARGET_PLATFORM%%,*}"

LABEL_ARGS=(
  --build-arg "ENV_APP_VERSION=${APP_VERSION}"
  --build-arg "IP2LOCATION_TOKEN=${IP2LOCATION_TOKEN:-}"
  --label "org.opencontainers.image.revision=${GIT_SHA}"
  --label "org.opencontainers.image.source=https://${IMAGE_REGISTRY}"
  --label "org.opencontainers.image.title=whatsmyip"
  --label "org.opencontainers.image.description=A simple service to display your external IP address with geolocation information"
  --label "org.opencontainers.image.version=${APP_VERSION}"
  --tag "${IMAGE_TAG}"
)

# Only tag latest on release builds
if [[ "${BUILD_TYPE}" == "release" ]]; then
  LABEL_ARGS+=(--tag "${IMAGE_REGISTRY}:latest")
fi

info "Version  : ${CYAN}${APP_VERSION}${RESET}"
info "Git SHA  : ${CYAN}${GIT_SHA}${RESET}"
info "Platform : ${CYAN}${TARGET_PLATFORM}${RESET}"
info "Image    : ${CYAN}${IMAGE_TAG}${RESET}"
info "Build    : ${CYAN}${BUILD_TYPE}${RESET}"
info "Mode     : ${CYAN}$(${PUSH} && echo 'build + scan + push' || echo 'local build + scan')${RESET}"
echo ""

# ── Build locally (always, so the image can be scanned) ─────────────────────
if $IS_MULTIPLATFORM; then
  info "Multi-platform build detected — scanning ${CYAN}${SCAN_PLATFORM}${RESET} only."
fi

docker buildx build "${LABEL_ARGS[@]}" --platform "${SCAN_PLATFORM}" --load .

# ── Scan ─────────────────────────────────────────────────────────────────────
echo ""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAN_SCRIPT="${SCRIPT_DIR}/scripts/scan-image.sh"

SCAN_EXIT_CODE=0
if [[ -x "$SCAN_SCRIPT" ]]; then
  info "Running vulnerability scan..."
  echo ""
  "$SCAN_SCRIPT" "${IMAGE_TAG}" || SCAN_EXIT_CODE=$?
else
  error "Scan script not found or not executable: ${SCAN_SCRIPT}"
  exit 1
fi

if [[ $SCAN_EXIT_CODE -ne 0 ]]; then
  echo ""
  error "Vulnerability scan failed — image will not be pushed."
  exit "$SCAN_EXIT_CODE"
fi

# ── Push (only if scan passed) ───────────────────────────────────────────────
if ${PUSH}; then
  echo ""
  if $IS_MULTIPLATFORM; then
    # --load is not supported for multi-platform; rebuild targeting all arches.
    warn "Multi-platform push: only ${SCAN_PLATFORM} was scanned. Other platforms are unscanned."
    info "Rebuilding for multi-platform push: ${CYAN}${TARGET_PLATFORM}${RESET}"
    echo ""
    docker buildx build "${LABEL_ARGS[@]}" --platform "${TARGET_PLATFORM}" --push .
  else
    info "Pushing ${CYAN}${IMAGE_TAG}${RESET}..."
    docker push "${IMAGE_TAG}"
    if [[ "${BUILD_TYPE}" == "release" ]]; then
      docker push "${IMAGE_REGISTRY}:latest"
    fi
  fi
fi

echo ""
info "Done — ${CYAN}${IMAGE_TAG}${RESET} (${GIT_SHA})"
