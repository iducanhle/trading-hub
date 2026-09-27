#!/usr/bin/env bash
# Smoke test: /api/health, then (when TOKEN is set) the main endpoints for AAPL and SAP.DE.
#
#   ./scripts/smoke.sh                                    # health only, http://localhost:8080
#   TOKEN=<Firebase ID token> ./scripts/smoke.sh https://api.example.duckdns.org
#
# The token is read from the environment so it stays out of shell history. Exits non-zero if any check fails.
set -uo pipefail

BASE=${1:-${BASE_URL:-http://localhost:8080}}
BASE=${BASE%/}
TOKEN=${TOKEN:-}
failures=0

check() { # check <expected status> <path> [auth]
  local expected=$1 path=$2 out status body
  if [ "${3:-}" = auth ]; then
    out=$(curl -s --max-time 60 -w $'\n%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE$path")
  else
    out=$(curl -s --max-time 60 -w $'\n%{http_code}' "$BASE$path")
  fi
  status=${out##*$'\n'}
  body=${out%$'\n'*}
  if [ "$status" = "$expected" ]; then
    printf 'OK   %s %-48s %s\n' "$status" "$path" "$(printf '%s' "$body" | tr -d '\n' | cut -c1-100)"
  else
    printf 'FAIL %s %-48s expected %s: %s\n' "$status" "$path" "$expected" "$(printf '%s' "$body" | tr -d '\n' | cut -c1-200)"
    failures=$((failures + 1))
  fi
}

echo "Smoke test against $BASE"
check 200 /api/health
if [ -z "$TOKEN" ]; then
  echo "TOKEN not set: skipped the authenticated endpoints"
  exit $((failures > 0))
fi

today=$(date -u +%Y-%m-%d)
in_six_days=$(date -u -d '+6 days' +%Y-%m-%d 2>/dev/null || date -u -v+6d +%Y-%m-%d)

check 200 /api/me auth
check 200 "/api/search?q=sap" auth
for symbol in AAPL SAP.DE; do
  check 200 "/api/stocks/$symbol" auth
  check 200 "/api/stocks/$symbol/prices?range=1Y" auth
  check 200 "/api/stocks/$symbol/history?period=WEEKLY&limit=5" auth
  check 200 "/api/stocks/$symbol/earnings" auth
  check 200 "/api/stocks/$symbol/recommendations" auth
  check 200 "/api/stocks/$symbol/news?limit=3" auth
  check 200 "/api/stocks/$symbol/peers" auth
done
check 200 "/api/calendar?from=$today&to=$in_six_days" auth
check 200 /api/followed/earnings auth
check 404 /api/stocks/ZZZZQX auth
check 400 /api/stocks/SAP.F auth

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All checks passed"
