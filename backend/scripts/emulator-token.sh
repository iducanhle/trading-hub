#!/usr/bin/env bash
# Prints a Firebase ID token for a verified test user in the LOCAL Auth emulator (creates the user on first run).
# Emulator only: nothing here touches a real Firebase project. The uid goes to stderr.
#
#   TOKEN=$(./scripts/emulator-token.sh)
#
# Start the backend with ALLOWED_EMAILS containing $EMAIL (default dev@example.com).
set -euo pipefail

AUTH=${FIREBASE_AUTH_EMULATOR_HOST:-localhost:9099}
PROJECT=${FIREBASE_PROJECT_ID:-demo-earnings-tracker}
EMAIL=${EMAIL:-dev@example.com}
PASSWORD=${PASSWORD:-emulator-only-password}
BASE="http://$AUTH/identitytoolkit.googleapis.com/v1"
BODY="{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"returnSecureToken\":true}"

field() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" | head -n 1; }

curl -s -X POST "$BASE/accounts:signUp?key=emulator" -H 'Content-Type: application/json' -d "$BODY" >/dev/null
uid=$(curl -s -X POST "$BASE/accounts:signInWithPassword?key=emulator" -H 'Content-Type: application/json' \
  -d "$BODY" | field localId)
if [ -z "$uid" ]; then
  echo "Could not sign in to the Auth emulator at $AUTH (is it running?)" >&2
  exit 1
fi
# The backend requires email_verified=true; the emulator's admin endpoint accepts the "owner" token.
curl -s -X POST "$BASE/projects/$PROJECT/accounts:update" -H 'Authorization: Bearer owner' \
  -H 'Content-Type: application/json' -d "{\"localId\":\"$uid\",\"emailVerified\":true}" >/dev/null
echo "uid: $uid" >&2
curl -s -X POST "$BASE/accounts:signInWithPassword?key=emulator" -H 'Content-Type: application/json' \
  -d "$BODY" | field idToken
