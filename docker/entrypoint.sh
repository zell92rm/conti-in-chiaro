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

# Token condiviso tra l'app e il worker di lettura email delle bollette (stesso criterio della chiave).
TOKEN_FILE=.wrangler/mail-sync.token
if [ -n "$MAIL_SYNC_TOKEN" ]; then
  TOKEN="$MAIL_SYNC_TOKEN"
elif [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(cat "$TOKEN_FILE")"
else
  TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')"
  echo "$TOKEN" > "$TOKEN_FILE"
fi
printf 'OPEN_BANKING_ENCRYPTION_KEY=%s\nMAIL_SYNC_TOKEN=%s\n' "$KEY" "$TOKEN" > .dev.vars

# Database D1 locale (Miniflare) salvato in .wrangler/state, persistito dal volume Docker.
npx wrangler d1 migrations apply conti-in-chiaro-db --local --config wrangler.d1.jsonc

# Worker di lettura email (IMAP) delle bollette: controlla ogni 30 s se è ora di partire; riparte da solo in caso di errore.
if [ "$DEV_HTTP" = "1" ]; then SCHEME=http; else SCHEME=https; fi
(
  while true; do
    MAIL_SYNC_TOKEN="$TOKEN" MAIL_SYNC_APP_URL="$SCHEME://127.0.0.1:5173" node scripts/mail-sync-worker.mjs || true
    sleep 15
  done
) &

exec npx vite --host 0.0.0.0 --port 5173
