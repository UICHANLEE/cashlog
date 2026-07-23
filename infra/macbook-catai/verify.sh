#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${CLOUDFLARED_CONFIG:-$HOME/.cloudflared/config.yml}"
MODEL_URL="${CATAI_LOCAL_URL:-http://127.0.0.1:8010}"
LABEL="com.cashlog.cloudflare-tunnel"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }
skip() { printf 'SKIP  %s\n' "$1"; }

listener="$(lsof -nP -iTCP:8010 -sTCP:LISTEN 2>/dev/null || true)"
if [[ "$listener" == *"127.0.0.1:8010"* ]] && [[ "$listener" != *"*:8010"* ]]; then
  pass "Catai listens only on 127.0.0.1:8010"
else
  fail "Catai must listen only on 127.0.0.1:8010"
fi

health="$(curl --fail --silent --show-error --max-time 5 "$MODEL_URL/health" 2>/dev/null || true)"
if [[ "$health" == *'"status":"ok"'* ]] && [[ "$health" == *'"model_loaded":true'* ]]; then
  pass "Catai health is OK and the model is loaded"
else
  fail "Catai health/model check failed"
fi

if [[ "$health" == *'"model_device":"mps"'* ]]; then
  pass "Catai uses Apple Metal (MPS)"
else
  fail "Catai is not reporting MPS"
fi

if [[ -f "$CONFIG_FILE" ]]; then
  if cloudflared tunnel --config "$CONFIG_FILE" ingress validate >/dev/null 2>&1; then
    pass "Cloudflare ingress configuration is valid"
  else
    fail "Cloudflare ingress configuration is invalid"
  fi
else
  skip "Cloudflare config is not installed yet"
fi

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  pass "Cloudflare Tunnel LaunchAgent is loaded"
else
  skip "Cloudflare Tunnel LaunchAgent is not installed yet"
fi

if [[ -n "${PRODUCT_ANALYZER_URL:-}" ]]; then
  if [[ -z "${PRODUCT_ANALYZER_API_KEY:-}" ]] || \
     [[ -z "${CLOUDFLARE_ACCESS_CLIENT_ID:-}" ]] || \
     [[ -z "${CLOUDFLARE_ACCESS_CLIENT_SECRET:-}" ]]; then
    fail "Remote check needs analyzer key and Cloudflare Access service-token variables"
  elif curl --fail --silent --show-error --max-time 15 \
    --header "X-API-Key: $PRODUCT_ANALYZER_API_KEY" \
    --header "CF-Access-Client-Id: $CLOUDFLARE_ACCESS_CLIENT_ID" \
    --header "CF-Access-Client-Secret: $CLOUDFLARE_ACCESS_CLIENT_SECRET" \
    "$PRODUCT_ANALYZER_URL/health" >/dev/null; then
    pass "Remote Cloudflare Access path reaches Catai"
  else
    fail "Remote Cloudflare Access path failed"
  fi
else
  skip "Set PRODUCT_ANALYZER_URL to test the remote path"
fi

if (( failures > 0 )); then
  exit 1
fi
