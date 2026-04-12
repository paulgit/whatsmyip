#!/usr/bin/env bash

# ---------------------------------------------------------------------------
# docker-build.sh — Build (and optionally push) the Docker image.
#
# Usage:
#   ./docker-build.sh [OPTIONS]
#
# Options:
#   --push              Push the image to the registry after building.
#   --platform <arch>   Target platform (default: linux/amd64).
#                       Supports any value accepted by `docker buildx --platform`.
#   --registry <url>    Override the default image registry/repo prefix.
#   --help              Show this help message and exit.
#
# Examples:
#   ./docker-build.sh                            # Local build, linux/amd64
#   ./docker-build.sh --push                     # Build and push
#   ./docker-build.sh --platform linux/arm64     # Local ARM64 build
#   ./docker-build.sh --push --platform linux/amd64,linux/arm64  # Multi-arch push
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
IMAGE_REGISTRY="code.paulg.it/paulgit/whatsmyip"
TARGET_PLATFORM="linux/amd64"
PUSH=false

# ── Colour helpers (disabled when stdout is not a terminal) ─────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' RESET=''
fi

info()  { echo -e "${GREEN}[INFO]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*" >&2; }
error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ── Usage / help ────────────────────────────────────────────────────────────
usage() {
  grep -E '^#( |$)' "$0" | head -n 18 | sed 's/^# \{0,1\}//'
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

# Warn if the working tree has uncommitted changes
if [[ $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') -ne 0 ]]; then
  warn "Git working tree is dirty — the image will contain uncommitted changes."
fi

# ── Build ───────────────────────────────────────────────────────────────────
IMAGE_TAG="${IMAGE_REGISTRY}:${APP_VERSION}"

info "Version  : ${CYAN}${APP_VERSION}${RESET}"
info "Git SHA  : ${CYAN}${GIT_SHA}${RESET}"
info "Platform : ${CYAN}${TARGET_PLATFORM}${RESET}"
info "Image    : ${CYAN}${IMAGE_TAG}${RESET}"
info "Mode     : ${CYAN}$(${PUSH} && echo 'build + push' || echo 'local build')${RESET}"
echo ""

BUILD_ARGS=(
  --build-arg "ENV_APP_VERSION=${APP_VERSION}"
  --platform "${TARGET_PLATFORM}"
  --label "org.opencontainers.image.revision=${GIT_SHA}"
  --label "org.opencontainers.image.source=https://${IMAGE_REGISTRY}"
  --label "org.opencontainers.image.title=whatsmyip"
  --label "org.opencontainers.image.description=A simple service to display your external IP address with geolocation information"
  --label "org.opencontainers.image.version=${APP_VERSION}"
  --tag "${IMAGE_TAG}"
  --tag "${IMAGE_REGISTRY}:latest"
)

if ${PUSH}; then
  BUILD_ARGS+=(--push)
else
  # --load imports the image into the local Docker daemon. It only works for
  # single-platform builds; multi-platform builds require --push.
  if [[ "${TARGET_PLATFORM}" == *","* ]]; then
    error "Multi-platform builds require --push (cannot --load multiple platforms)."
    exit 1
  fi
  BUILD_ARGS+=(--load)
fi

docker buildx build "${BUILD_ARGS[@]}" .

echo ""
info "Done — ${CYAN}${IMAGE_TAG}${RESET} (${GIT_SHA})"
