#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUNNEL_UUID="${1:-}"
HOSTNAME="${2:-ai-gateway.cashlog.ai.kr}"
CATAI_ROOT="${CATAI_ROOT:-$HOME/workspace/catai}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-$(command -v cloudflared || true)}"
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"
CREDENTIALS_FILE="$CONFIG_DIR/$TUNNEL_UUID.json"
PLIST_FILE="$HOME/Library/LaunchAgents/com.cashlog.cloudflare-tunnel.plist"
LABEL="com.cashlog.cloudflare-tunnel"
DOMAIN_RE='^[A-Za-z0-9.-]+$'
UUID_RE='^[0-9a-fA-F-]{36}$'

usage() {
  echo "Usage: $0 TUNNEL_UUID [HOSTNAME]" >&2
  echo "Example: $0 00000000-0000-0000-0000-000000000000 ai-gateway.cashlog.ai.kr" >&2
}

if [[ ! "$TUNNEL_UUID" =~ $UUID_RE ]] || [[ ! "$HOSTNAME" =~ $DOMAIN_RE ]]; then
  usage
  exit 2
fi

if [[ -z "$CLOUDFLARED_BIN" ]]; then
  echo "cloudflared is not installed. Run: brew install cloudflared" >&2
  exit 1
fi

if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "Missing tunnel credentials: $CREDENTIALS_FILE" >&2
  echo "Run 'cloudflared tunnel login' and 'cloudflared tunnel create cashlog-catai' first." >&2
  exit 1
fi

if ! curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:8010/health >/dev/null; then
  echo "Catai is not healthy at http://127.0.0.1:8010/health" >&2
  exit 1
fi

umask 077
mkdir -p "$CONFIG_DIR" "$HOME/Library/LaunchAgents" "$CATAI_ROOT/logs"

sed \
  -e "s|__TUNNEL_UUID__|$TUNNEL_UUID|g" \
  -e "s|__HOSTNAME__|$HOSTNAME|g" \
  -e "s|__HOME__|$HOME|g" \
  "$SCRIPT_DIR/cloudflared.config.example.yml" > "$CONFIG_FILE"

sed \
  -e "s|__CLOUDFLARED_BIN__|$CLOUDFLARED_BIN|g" \
  -e "s|__CATAI_ROOT__|$CATAI_ROOT|g" \
  -e "s|__HOME__|$HOME|g" \
  "$SCRIPT_DIR/com.cashlog.cloudflare-tunnel.plist.example" > "$PLIST_FILE"

chmod 600 "$CONFIG_FILE" "$CREDENTIALS_FILE" "$PLIST_FILE"
"$CLOUDFLARED_BIN" tunnel --config "$CONFIG_FILE" ingress validate
plutil -lint "$PLIST_FILE"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed $LABEL"
echo "Public hostname: https://$HOSTNAME"
echo "Run '$SCRIPT_DIR/verify.sh' after Cloudflare Access is configured."
