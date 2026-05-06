#!/usr/bin/env bash
set -euo pipefail

# Mirage installer (TypeScript CLI)
# Usage: curl -fsSL https://strukto.ai/mirage/install.sh | sh

PKG="@struktoai/mirage-cli"
MIN_NODE_MAJOR=20

RESET='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'

info() { printf "${BOLD}info${RESET}: %s\n" "$1"; }
warn() { printf "${YELLOW}warn${RESET}: %s\n" "$1"; }
err()  { printf "${RED}error${RESET}: %s\n" "$1" >&2; exit 1; }
ok()   { printf "${GREEN}ok${RESET}: %s\n" "$1"; }

OS=$(uname -s)
case "$OS" in
  Darwin|Linux) ;;
  *) err "Unsupported OS: $OS. Mirage supports macOS and Linux." ;;
esac

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64|arm64|aarch64) ;;
  *) err "Unsupported architecture: $ARCH." ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  err "curl is required but not installed."
fi

node_major() {
  node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node_major)
    if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      return 0
    fi
    warn "Node $(node --version) is older than required v${MIN_NODE_MAJOR}."
  else
    info "Node.js not found."
  fi

  info "Installing Node.js via fnm..."
  if ! command -v fnm >/dev/null 2>&1; then
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env --shell bash 2>/dev/null || true)"
  fi
  if ! command -v fnm >/dev/null 2>&1; then
    err "Failed to install fnm. Install Node.js >= ${MIN_NODE_MAJOR} manually: https://nodejs.org/"
  fi
  fnm install --lts
  fnm use lts-latest
  eval "$(fnm env --shell bash 2>/dev/null || true)"

  if ! command -v node >/dev/null 2>&1; then
    err "Node.js installation failed. Install manually: https://nodejs.org/"
  fi
}

ensure_node

if ! command -v npm >/dev/null 2>&1; then
  err "npm not found after Node install. Reinstall Node.js: https://nodejs.org/"
fi

info "Installing ${PKG} globally via npm..."
if ! npm install -g "${PKG}"; then
  warn "Global install failed (likely a permissions issue on a system Node)."
  warn "Retry with sudo, or use a Node version manager (fnm/nvm/volta)."
  exit 1
fi

if ! command -v mirage >/dev/null 2>&1; then
  NPM_BIN="$(npm bin -g 2>/dev/null || echo "")"
  warn "'mirage' is not on your PATH yet."
  if [ -n "$NPM_BIN" ]; then
    warn "Add this to your shell profile (~/.zshrc, ~/.bashrc):"
    warn "  export PATH=\"${NPM_BIN}:\$PATH\""
  fi
  exit 0
fi

VERSION=$(mirage --version 2>/dev/null || echo "")
ok "Mirage installed${VERSION:+ ($VERSION)}"

printf "\nNext steps:\n"
printf "  mirage --help\n"
printf "\nDocs: https://docs.mirage.strukto.ai\n"
