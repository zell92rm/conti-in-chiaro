#!/bin/sh
set -e
cd /app

# Chiave per cifrare le credenziali Enable Banking (Base64, 32 byte).
# Priorità: variabile d'ambiente, poi chiave già generata (nel volume dati), altrimenti ne crea una nuova.
KEY_FILE=.wrangler/open-banking.key
mkdir -p .wrangler
if [ -n "$OPEN_BANKING_ENCRYPTION_KEY" ]; then
  KEY="$OPEN_BANKING_ENCRYPTION_KEY"
elif [ -f "$KEY_FILE" ]; then
  KEY="$(cat "$KEY_FILE")"
else
  KEY="$(head -c 32 /dev/urandom | base64)"
  echo "$KEY" > "$KEY_FILE"
fi
echo "OPEN_BANKING_ENCRYPTION_KEY=$KEY" > .dev.vars

# Database D1 locale (Miniflare) salvato in .wrangler/state, persistito dal volume Docker.
npx wrangler d1 migrations apply conti-in-chiaro-db --local --config wrangler.d1.jsonc

exec npx vite --host 0.0.0.0 --port 5173
