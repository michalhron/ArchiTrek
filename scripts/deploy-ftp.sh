#!/usr/bin/env bash
# Upload project root to FTP (mirror). Requires: lftp (brew install lftp)
# Credentials: copy .env.deploy.example -> .env.deploy and edit locally.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.deploy ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy
  set +a
fi

: "${FTP_HOST:?Set FTP_HOST in .env.deploy (see .env.deploy.example)}"
: "${FTP_USER:?Set FTP_USER in .env.deploy}"
: "${FTP_PASS:?Set FTP_PASS in .env.deploy}"
: "${FTP_REMOTE_DIR:?Set FTP_REMOTE_DIR in .env.deploy}"

FTP_PORT="${FTP_PORT:-21}"
FTP_USE_TLS="${FTP_USE_TLS:-0}"

echo "Deploy from: $ROOT"
echo "Target:      $FTP_USER @ $FTP_HOST:$FTP_PORT -> $FTP_REMOTE_DIR"

EXCLUDE_ARGS=(
  -X '.git/'
  -X '.gitignore'
  -X '.env'
  -X '.env.*'
  -X '*.local'
  -X '.cursor/'
  -X '.vscode/'
  -X '.idea/'
  -X '.DS_Store'
  -X 'Archive.zip'
  -X '**/Untitled'
  # Dev-only (never upload to shared hosting — huge, symlinks fail on FTP)
  -X 'node_modules/'
  -X 'package.json'
  -X 'package-lock.json'
  -X 'pnpm-lock.yaml'
  -X 'yarn.lock'
  -X 'playwright.config.js'
  -X 'vitest.config.js'
  -X 'tests/'
  -X 'test-results/'
  -X 'playwright-report/'
  -X 'blob-report/'
  -X 'coverage/'
  -X '.vite/'
  # Documentation and its images (GitHub only)
  -X 'docs/'
)

if [[ "$FTP_USE_TLS" == "1" ]]; then
  TLS_LINES=$'set ftp:ssl-force true\nset ftp:ssl-protect-data true\nset ssl:verify-certificate no'
else
  TLS_LINES=$'set ftp:ssl-allow yes\nset ssl:verify-certificate no'
fi

# shellcheck disable=SC2086
lftp -u "$FTP_USER,$FTP_PASS" -p "$FTP_PORT" "$FTP_HOST" <<EOF
$TLS_LINES
cd "$FTP_REMOTE_DIR"
lcd "$ROOT"
mirror --reverse --delete --delete-excluded --verbose ${EXCLUDE_ARGS[*]} . .
bye
EOF

echo "Done."
