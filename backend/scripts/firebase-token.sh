#!/usr/bin/env bash
# Prints a Firebase ID token for an Email/Password user of your REAL Firebase project, to call the deployed API
# with curl (docs/DEPLOYMENT-backend.md, section 8). Asks for the password; it is never echoed or stored.
#
#   export FIREBASE_WEB_API_KEY=AIza...        # Firebase console → Project settings → General → Web API Key
#   ./scripts/firebase-token.sh --signup you@example.com   # once: create the user and send the verification email
#   TOKEN=$(./scripts/firebase-token.sh you@example.com)   # after clicking the link in that email
#
# The token is valid for 1 hour. The backend accepts it only if the email is in ALLOWED_EMAILS and verified.
set -euo pipefail

usage() {
  echo "Usage: FIREBASE_WEB_API_KEY=... $0 [--signup] <email>" >&2
  exit 2
}

signup=false
if [ "${1:-}" = "--signup" ]; then
  signup=true
  shift
fi
EMAIL=${1:-}
[ -n "$EMAIL" ] || usage
API_KEY=${FIREBASE_WEB_API_KEY:?Set FIREBASE_WEB_API_KEY (Firebase console → Project settings → General)}
BASE="https://identitytoolkit.googleapis.com/v1"

read -r -s -p "Password for $EMAIL: " PASSWORD </dev/tty
echo >&2

json_string() { # JSON-escapes backslashes and double quotes
  local s=${1//\\/\\\\}
  printf '"%s"' "${s//\"/\\\"}"
}
field() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" | head -n 1; }
call() { # call <method> <json body>; the API key goes in a header, not the URL
  curl -s -X POST "$BASE/$1" -H "X-Goog-Api-Key: $API_KEY" -H 'Content-Type: application/json' -d "$2"
}

BODY="{\"email\":$(json_string "$EMAIL"),\"password\":$(json_string "$PASSWORD"),\"returnSecureToken\":true}"

if $signup; then
  response=$(call accounts:signUp "$BODY")
  token=$(printf '%s' "$response" | field idToken)
  if [ -z "$token" ]; then
    echo "Sign-up failed: $(printf '%s' "$response" | field message)" >&2
    exit 1
  fi
  call accounts:sendOobCode "{\"requestType\":\"VERIFY_EMAIL\",\"idToken\":\"$token\"}" >/dev/null
  echo "Created $EMAIL and sent a verification email. Click its link, then run this script without --signup." >&2
  exit 0
fi

response=$(call accounts:signInWithPassword "$BODY")
token=$(printf '%s' "$response" | field idToken)
if [ -z "$token" ]; then
  echo "Sign-in failed: $(printf '%s' "$response" | field message)" >&2
  exit 1
fi
printf '%s\n' "$token"
