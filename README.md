# Conti in Chiaro

Applicazione full-stack per gestire conti, movimenti, budget e spese fisse, con importazione CSV/XLSX e integrazione Open Banking tramite Enable Banking. Il progetto usa React/Next tramite Vinext, Cloudflare Workers e Cloudflare D1.

## Funzionalità

- Registrazione, accesso e sessioni utente.
- Conti personali, conti risparmio e conti per le spese mensili.
- Dashboard per conto e periodo, saldo, entrate, uscite e disponibilità effettiva.
- Inserimento e modifica dei movimenti, categorie personalizzate e regole per parole chiave.
- Importazione CSV/XLSX con anteprima, modifica categorie, riconoscimento duplicati e inserimento forzato.
- Spese fisse mensili, ricerca del movimento corrispondente, mesi saltati e riconciliazione automatica.
- Enable Banking configurabile per utente e collegabile ai singoli conti.
- Sincronizzazione di saldo e transazioni Enable Banking contabilizzate (`BOOK`) e non contabilizzate (`PDNG`) per il periodo selezionato.
- Le transazioni contabilizzate usano `value_date`; per le `PDNG` prive di data valuta viene usata `transaction_date` oppure, se assente, la data finale effettiva della sincronizzazione. `booking_date` non viene usata.
- Quando una transazione Enable Banking `PDNG` diventa `BOOK`, il movimento esistente viene riconciliato aggiornandone data e stato anche se la data definitiva è diversa; gli import CSV e i movimenti manuali non vengono modificati.
- Anteprima delle transazioni bancarie nello stesso popup dell’import file, con gestione di categorie, duplicati e spese fisse.
- Pagine pubbliche Privacy e Termini.

## Requisiti

- Node.js `>=22.13.0`
- npm
- Account Cloudflare con Workers e D1
- Account Enable Banking, Application ID e private key RSA PKCS#8 in formato PEM

## Comandi usati più spesso

```bash
# Installazione dipendenze
npm ci

# Sviluppo locale HTTPS con Worker, D1 e binding Cloudflare simulati
npm run dev

# Controlli
npm run lint
npm test

# Build di produzione
npm run build

# Avvio locale della build
npm run start

# Generazione migrazioni Drizzle dopo modifiche allo schema
npm run db:generate
```

## Database D1

Il binding D1 del Worker è definito in `wrangler.jsonc`. Le migrazioni si trovano in `drizzle/`.

```bash
# Applica le migrazioni al D1 locale
npx wrangler d1 migrations apply conti-in-chiaro-db --local

# Applica le migrazioni al D1 Cloudflare remoto
npx wrangler d1 migrations apply conti-in-chiaro-db --remote
```

Eseguire le migrazioni remote prima di pubblicare codice che richiede nuove tabelle o colonne.

## Variabili per lo sviluppo locale

Creare `.dev.vars` nella root. Il file è ignorato da Git e dal caricamento degli asset Cloudflare.

```dotenv
OPEN_BANKING_ENCRYPTION_KEY="CHIAVE_BASE64_DA_32_BYTE"
```

Generazione della master key locale:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Dopo ogni modifica a `.dev.vars` riavviare `npm run dev`.

Il server di sviluppo usa HTTPS con un certificato self-signed generato automaticamente da Vite. Al primo accesso a `https://localhost:5173` il browser può mostrare un avviso: accettare il certificato soltanto per lo sviluppo locale. La porta effettiva è quella indicata nel terminale.

## Secret Cloudflare di produzione

La master key di produzione deve essere un Worker Secret e non deve essere inserita in `.dev.vars`, `wrangler.jsonc`, database o repository:

```bash
npx wrangler secret put OPEN_BANKING_ENCRYPTION_KEY
```

Il valore deve essere Base64 e decodificare esattamente 32 byte. Non cambiare la master key dopo aver salvato configurazioni Enable Banking: le private key già cifrate non sarebbero più decifrabili.

## Configurazione Enable Banking

Nel Control Panel Enable Banking configurare:

- Redirect URL: `https://conti-in-chiaro.nic-sardella.workers.dev/api/open-banking/callback`
- Privacy URL: `https://conti-in-chiaro.nic-sardella.workers.dev/privacy`
- Terms URL: `https://conti-in-chiaro.nic-sardella.workers.dev/terms`

Flusso applicativo:

1. Creare e configurare l’applicazione nel Control Panel Enable Banking.
2. Salvare Application ID e private key PEM dalla pagina Configurazione.
3. Verificare le credenziali con `GET /application`.
4. Aprire le impostazioni di un conto, scegliere una banca dall’elenco ASPSP e completare l’autorizzazione.
5. Dalla dashboard usare **Sincronizza con Enable Banking**.
6. Controllare l’anteprima e confermare i movimenti da importare.

La private key viene validata e cifrata immediatamente con AES-256-GCM e un IV casuale. Nel database viene conservata soltanto cifrata e non viene mai restituita alle API frontend.

### Callback durante lo sviluppo locale

Anche in locale la callback richiede i parametri `code` e `state` restituiti da Enable Banking e applica la stessa verifica usata in produzione. Per completare il flusso occorre esporre il server locale tramite un Cloudflare Tunnel HTTPS e registrare nel Control Panel Enable Banking l’URL pubblico del tunnel seguito da `/api/open-banking/callback`.

## Deploy Cloudflare

```bash
# Login, se necessario
npx wrangler login

# Build e test
npm test

# Migrazioni sul database remoto
npx wrangler d1 migrations apply conti-in-chiaro-db --remote

# Pubblicazione del Worker
npx wrangler deploy
```

Dopo il deploy verificare:

- secret `OPEN_BANKING_ENCRYPTION_KEY` presente;
- binding D1 `conti_in_chiaro_db` disponibile;
- callback, Privacy e Termini raggiungibili;
- credenziali Enable Banking verificabili;
- collegamento e sincronizzazione di un conto di test.

## Struttura principale

- `app/`: pagine, componenti e route API.
- `app/api/open-banking/`: configurazione, callback, banche, collegamenti e sincronizzazione.
- `db/schema.ts`: schema Drizzle/D1.
- `drizzle/`: migrazioni SQL.
- `lib/open-banking-crypto.ts`: validazione PEM, AES-256-GCM e firma JWT RS256.
- `lib/enable-banking-client.ts`: chiamate server-side autenticate verso Enable Banking.
- `worker/index.ts`: entry point Cloudflare Worker.
- `wrangler.jsonc`: binding e configurazione Cloudflare.

## Sicurezza

- Non committare `.dev.vars`, `.env`, file PEM o secret.
- Non stampare JWT, master key o private key nei log.
- Non restituire private key o dati cifrati alle API frontend.
- Le operazioni sensibili richiedono autenticazione e controllo dell’origine.
- Disabilitare Enable Banking elimina configurazione, autorizzazioni e collegamenti; i movimenti importati restano disponibili.
