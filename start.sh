#!/usr/bin/env bash
# Start everything for Job_apply. Safe to re-run; nothing here submits an application.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE24="$HOME/.nvm/versions/node/v24.19.0/bin"

echo "==> Docker"
docker info >/dev/null 2>&1 || { open -a Docker; printf "   waiting for Docker"; until docker info >/dev/null 2>&1; do printf .; sleep 3; done; echo; }

echo "==> Twenty server (http://localhost:3001)"
cd "$ROOT/.twenty-server"
docker compose up -d >/dev/null 2>&1
printf "   waiting for healthz"
until [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3001/healthz 2>/dev/null)" = "200" ]; do printf .; sleep 5; done
echo " ready"

echo "==> Control plane (http://localhost:4310)"
cd "$ROOT"
if curl -s -o /dev/null -m 3 http://localhost:4310/ 2>/dev/null; then
  echo "   already running"
else
  set -a; . "$ROOT/.env.control-plane"; set +a
  nohup node src/control-plane-server.mjs > "$ROOT/.control-plane.log" 2>&1 &
  sleep 2
  echo "   started (log: .control-plane.log)"
fi

echo
echo "Twenty UI      : http://localhost:3001   -> Job Search Dashboard"
echo "Control plane  : http://localhost:4310   (401 without token = correct)"
echo "Submissions    : DISABLED (JOB_APPLY_ALLOW_SUBMIT=false)"
echo
echo "To work on the Twenty app:  export PATH=\"$NODE24:\$PATH\" && cd apps/twenty-job-search-crm && yarn twenty dev"
