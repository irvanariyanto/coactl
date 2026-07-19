#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_URL="https://github.com/irvanariyanto/coactl.git"
INSTALL_DIR="${COACTL_INSTALL_DIR:-$HOME/.local/share/coactl}"
STATE_DIR="${COACTL_STATE_DIR:-$HOME/.local/state/coactl}"
PID_FILE="$STATE_DIR/coactl.pid"
LOG_FILE="$STATE_DIR/coactl.log"
ACTION="${1:---foreground}"

say() {
  printf '\n\033[1;38;5;179mcoactl\033[0m  %s\n' "$1"
}

fail() {
  printf '\ncoactl: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: install.sh [option]

  --foreground  Install or update, then run in this terminal (default)
  --background  Install or update, then run in the background
  --stop        Stop the background process
  --status      Show whether the background process is running
  --help        Show this help
EOF
}

running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

stop_background() {
  local pid
  if ! pid="$(running_pid)"; then
    rm -f "$PID_FILE"
    say "coactl is not running in the background"
    return 0
  fi

  say "Stopping background process $pid"
  kill "$pid"
  for _ in {1..50}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    fail "coactl did not stop. Check $LOG_FILE"
  fi
  rm -f "$PID_FILE"
  say "Stopped"
}

case "$ACTION" in
  --help | -h)
    usage
    exit 0
    ;;
  --status)
    if pid="$(running_pid)"; then
      say "Running in the background with PID $pid"
      printf 'Log: %s\n' "$LOG_FILE"
      exit 0
    fi
    rm -f "$PID_FILE"
    say "coactl is not running in the background"
    exit 1
    ;;
  --stop)
    stop_background
    exit 0
    ;;
  --foreground | --background) ;;
  *)
    usage >&2
    fail "Unknown option: $ACTION"
    ;;
esac

command -v git >/dev/null 2>&1 || fail "Git is required. Install Git and run this command again."
command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  fail "Node.js 20 or newer is required; found $(node --version)."
fi

if [[ "$ACTION" == "--background" ]] && running_pid >/dev/null; then
  stop_background
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  EXISTING_REMOTE="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
  case "$EXISTING_REMOTE" in
    https://github.com/irvanariyanto/coactl.git | git@github.com:irvanariyanto/coactl.git) ;;
    *) fail "$INSTALL_DIR is a different Git checkout. Set COACTL_INSTALL_DIR to use another location." ;;
  esac

  say "Updating the existing installation"
  git -C "$INSTALL_DIR" pull --ff-only
elif [[ -e "$INSTALL_DIR" ]]; then
  fail "$INSTALL_DIR already exists but is not a coactl Git checkout. Set COACTL_INSTALL_DIR to use another location."
else
  say "Installing into $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPOSITORY_URL" "$INSTALL_DIR"
fi

say "Installing dependencies"
npm install --prefix "$INSTALL_DIR"

if [[ "$ACTION" == "--foreground" ]]; then
  say "Starting coactl at http://127.0.0.1:5173"
  cd "$INSTALL_DIR"
  exec npm run dev
fi

if pid="$(running_pid)"; then
  say "coactl is already running in the background with PID $pid"
  printf 'Log: %s\n' "$LOG_FILE"
  exit 0
fi

mkdir -p "$STATE_DIR"
rm -f "$PID_FILE"
say "Starting coactl in the background"
(
  cd "$INSTALL_DIR"
  COACTL_OPEN_BROWSER=0 nohup node scripts/dev.mjs >>"$LOG_FILE" 2>&1 &
  printf '%s\n' "$!" >"$PID_FILE"
)

sleep 1
if pid="$(running_pid)"; then
  say "Running at http://127.0.0.1:5173 with PID $pid"
  printf 'Log: %s\n' "$LOG_FILE"
else
  rm -f "$PID_FILE"
  fail "coactl failed to start. Check $LOG_FILE"
fi
