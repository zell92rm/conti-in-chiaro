# Conti in Chiaro

Applicazione web full-stack per gestire conti personali, movimenti, budget, risparmi e spese fisse. Include importazioni CSV/XLSX, categorizzazione tramite parole chiave e integrazione Open Banking con Enable Banking.

> [English version](#english)

## Italiano

### Panoramica

Conti in Chiaro riunisce tre modalità di gestione:

- **Personale**: saldo, previsione del risparmio e spese fisse nel periodo finanziario configurato.
- **Spese mese**: disponibilità settimanale, riporto del residuo e distribuzione facoltativa di una spesa sull'intero periodo.
- **Risparmi**: andamento del saldo e monitoraggio di un obiettivo.

L'applicazione è pensata per un'installazione personale con un solo utente: il primo account registrato occupa l'unico profilo disponibile.

### Funzionalità

- Dashboard responsive per singolo conto e vista aggregata.
- Periodi contabili specifici per tipologia di conto.
- Inserimento e modifica di data, descrizione, dettaglio, importo e categoria.
- Ricerca per descrizione, categoria, conto, data e importo.
- Importazione CSV/XLSX con anteprima e selezione dei movimenti.
- L'importazione da file è stata testata e configurata esclusivamente per i CSV di HYPE, i CSV di Revolut e i file XLSX di Intesa Sanpaolo. File provenienti da altri istituti o in formati differenti potrebbero non essere riconosciuti correttamente.
- Importazione dei movimenti contabilizzati (`BOOK`) tramite Enable Banking.
- Riconoscimento dei duplicati tra inserimenti manuali, file ed Enable Banking.
- Aggiornamenti non distruttivi quando una nuova fonte fornisce maggiori informazioni.
- Categorie personalizzate con parole chiave e blacklist.
- Spese fisse attivabili, disattivabili o ignorabili per un periodo.
- Associazione delle spese fisse tramite importo, descrizione, dettaglio e parole chiave.
- Previsioni dei saldi al netto delle spese fisse ancora da pagare.
- Interfaccia ottimizzata per desktop e dispositivi mobili.
- Interfaccia multilingua in italiano e inglese, selezionabile dalla pagina Configurazione e memorizzata nel browser.

### Stack

- React 19, Next.js 16 e Vinext.
- TypeScript e Vite.
- Cloudflare Workers e Static Assets.
- Cloudflare D1 con Drizzle ORM.
- Tailwind CSS e componenti shadcn/Base UI.
- Recharts.
- Web Crypto API.

### Requisiti

- Node.js `>= 22.13.0` e npm.
- Account Cloudflare con Workers e D1.
- Facoltativamente, account Enable Banking con Application ID e private key RSA PKCS#8 PEM.

### Installazione locale

```bash
git clone <URL_DELLA_REPOSITORY>
cd sito_conti
npm ci
```

Per testare Enable Banking in locale è necessario creare manualmente il file `.dev.vars` nella root del progetto, allo stesso livello di `package.json`. Wrangler carica questo file esclusivamente nell'ambiente locale e rende la variabile disponibile al Worker durante `npm run dev`.

Il file deve contenere una master key Base64 che decodifichi esattamente 32 byte:

```dotenv
OPEN_BANKING_ENCRYPTION_KEY="CHIAVE_BASE64_DA_32_BYTE"
```

Generare una chiave valida con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Non aggiungere `.dev.vars`, file PEM o credenziali al repository.

Dopo aver creato o modificato `.dev.vars`, arrestare e riavviare `npm run dev`. La stessa master key deve essere mantenuta finché nel database locale sono presenti configurazioni Enable Banking cifrate: cambiandola, le private key già salvate non saranno più decifrabili.

`.dev.vars` configura soltanto la cifratura locale. Application ID e private key PEM vengono invece caricati dall'interfaccia **Configurazione → Enable Banking**. Per completare l'autorizzazione bancaria in locale serve inoltre un URL HTTPS pubblico, per esempio un Cloudflare Tunnel, registrato nel Control Panel Enable Banking.

### Comandi

```bash
npm run dev          # Server locale HTTPS
npm run lint         # Analisi statica
npm run build        # Build di produzione
npm test             # Build e test automatici
npm run start        # Avvio locale della build
npm run db:generate  # Generazione migrazioni Drizzle
```

Il server locale usa HTTPS con un certificato autofirmato. Il browser può mostrare un avviso al primo accesso; accettarlo solo per lo sviluppo locale e usare la porta indicata nel terminale.

### Database e migrazioni

Lo schema è in `src/db/schema.ts` e le migrazioni SQL in `drizzle/`. Il binding applicativo D1 è `DB`.

`.deployment/hosting.json` dichiara il binding logico usato dalla build. `wrangler.d1.jsonc` è riservato alle migrazioni e non deve essere usato per il deploy del Worker.

```bash
# Database locale
npx wrangler d1 migrations apply conti-in-chiaro-db --local --config wrangler.d1.jsonc

# Database Cloudflare
npx wrangler d1 migrations apply conti-in-chiaro-db --remote --config wrangler.d1.jsonc
```

Applicare le migrazioni remote prima di pubblicare codice che richiede nuove tabelle o colonne.

### Enable Banking

1. Creare un'applicazione nel Control Panel Enable Banking.
2. Aprire la guida nella sezione **Configurazione → Enable Banking** e copiare Redirect, Privacy e Terms URL. Gli indirizzi dipendono dall'host reale del sito.
3. Caricare Application ID e private key RSA PKCS#8.
4. Verificare la configurazione.
5. Aprire le impostazioni di un conto, selezionare la banca e completare l'autorizzazione.
6. Sincronizzare dalla dashboard e controllare l'anteprima prima dell'importazione.

La sincronizzazione richiede esclusivamente transazioni contabilizzate (`transaction_status=BOOK`). I movimenti non contabilizzati (`PDNG`) non vengono richiesti né importati.

In sviluppo locale il callback richiede un endpoint HTTPS pubblico, per esempio un Cloudflare Tunnel, registrato nel Control Panel Enable Banking.

### Sicurezza

- Password derivate con PBKDF2-SHA-256, salt casuale e 100.000 iterazioni; nessuna password è salvata in chiaro.
- Token di sessione casuali con solo l'hash conservato nel database.
- Cookie `HttpOnly`, `Secure` in produzione e `SameSite=Lax`.
- Blocco temporaneo di 15 minuti dopo cinque accessi falliti.
- Private key Enable Banking validata e cifrata con AES-256-GCM e IV casuale.
- Operazioni sensibili protette da autenticazione e verifica della stessa origine.

`OPEN_BANKING_ENCRYPTION_KEY` deve essere un secret e non deve essere salvato nel database o nel repository. Non cambiarlo senza una migrazione: le private key già cifrate non sarebbero più decifrabili.

La password originale non è recuperabile. Non è ancora presente un flusso self-service di recupero; un reset amministrativo deve generare un nuovo hash e un nuovo salt compatibili.

### Deploy Cloudflare

```bash
# Configurazione iniziale del secret
npx wrangler secret put OPEN_BANKING_ENCRYPTION_KEY

# Verifica, migrazioni e pubblicazione
npm test
npx wrangler d1 migrations apply conti-in-chiaro-db --remote --config wrangler.d1.jsonc
npx wrangler deploy
```

Il dominio stabile `workers.dev` è abilitato e gli URL di anteprima sono disabilitati in `wrangler.jsonc`.

Dopo il deploy verificare:

- binding D1 `DB` presente una sola volta;
- secret `OPEN_BANKING_ENCRYPTION_KEY` configurato;
- Privacy, Termini e callback sul dominio di produzione;
- login, importazione e sincronizzazione con un conto di prova.

### Struttura

```text
src/app/                     Pagine, dashboard e route API
src/app/api/open-banking/    Configurazione e sincronizzazione Enable Banking
src/app/configurazione/      Impostazioni generali e dei conti
src/components/              Componenti condivisi
src/db/schema.ts             Schema Drizzle per D1
drizzle/                     Migrazioni SQL
src/hooks/                   Hook React condivisi
src/lib/                     Periodi, crittografia e client bancario
scripts/                     Script di build e ambiente
tests/                       Test automatici
src/worker/index.ts          Entry point Cloudflare Worker
wrangler.jsonc               Configurazione build e deploy
wrangler.d1.jsonc            Configurazione delle sole migrazioni D1
```

### Contribuire

1. Creare un branch dedicato.
2. Non includere file generati, database, PEM o credenziali.
3. Eseguire `npm run lint` e `npm test`.
4. Documentare nella pull request comportamento, migrazioni e implicazioni di sicurezza.

### Licenza

Il progetto è distribuito sotto la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consulta il file [LICENSE](LICENSE) per il testo completo e le condizioni di utilizzo, modifica e distribuzione.

---

## English

### Overview

Conti in Chiaro is a full-stack personal finance application supporting three account workflows:

- **Personal**: balance, savings forecast, and fixed expenses over a custom financial period.
- **Monthly expenses**: weekly allowance, carry-over, and optional distribution of an expense across the period.
- **Savings**: balance history and savings-goal tracking.

It is designed as a personal, single-user installation. The first registered account occupies the only available user profile.

### Features

- Responsive individual-account and aggregate dashboards.
- Account periods tailored to each account type.
- Transaction creation and editing with date, description, optional details, amount, and category.
- Search by description, category, account, date, and amount.
- CSV/XLSX imports with review and per-transaction selection.
- File import has been tested and configured exclusively for HYPE CSV files, Revolut CSV files, and Intesa Sanpaolo XLSX files. Files from other institutions or in different formats may not be recognized correctly.
- Enable Banking imports for booked (`BOOK`) transactions.
- Duplicate detection across manual entries, files, and Enable Banking.
- Non-destructive updates when a source provides additional information.
- Custom categories with keywords and blacklists.
- Fixed expenses that can be enabled, permanently disabled, or skipped for one period.
- Fixed-expense matching by amount, description, details, and keywords.
- Balance forecasts accounting for unpaid fixed expenses.
- Desktop and mobile-optimized interface.
- Multilingual Italian and English interface, selectable from Configuration and persisted in the browser.

### Technology stack

- React 19, Next.js 16, and Vinext.
- TypeScript and Vite.
- Cloudflare Workers and Static Assets.
- Cloudflare D1 with Drizzle ORM.
- Tailwind CSS and shadcn/Base UI components.
- Recharts.
- Web Crypto API.

### Requirements

- Node.js `>= 22.13.0` and npm.
- A Cloudflare account with Workers and D1.
- Optionally, an Enable Banking account, Application ID, and RSA PKCS#8 PEM private key.

### Local installation

```bash
git clone <REPOSITORY_URL>
cd sito_conti
npm ci
```

To test Enable Banking locally, manually create `.dev.vars` in the project root, next to `package.json`. Wrangler loads this file only in the local environment and exposes the variable to the Worker while `npm run dev` is running.

The file must contain a Base64 master key that decodes to exactly 32 bytes:

```dotenv
OPEN_BANKING_ENCRYPTION_KEY="32_BYTE_BASE64_KEY"
```

Generate a valid key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.dev.vars`, PEM files, or credentials.

After creating or changing `.dev.vars`, stop and restart `npm run dev`. Keep the same master key while the local database contains encrypted Enable Banking configurations; changing it makes previously stored private keys impossible to decrypt.

`.dev.vars` configures local encryption only. Upload the Application ID and PEM private key through **Configuration → Enable Banking**. Completing bank authorization locally also requires a public HTTPS URL, such as a Cloudflare Tunnel, registered in the Enable Banking Control Panel.

### Commands

```bash
npm run dev          # Local HTTPS server
npm run lint         # Static analysis
npm run build        # Production build
npm test             # Build and automated tests
npm run start        # Run the generated build locally
npm run db:generate  # Generate Drizzle migrations
```

The local server uses HTTPS with a self-signed certificate. The browser may display a warning on first access; accept it for local development only and use the port printed in the terminal.

### Database and migrations

The schema is located in `src/db/schema.ts`, and SQL migrations are stored in `drizzle/`. The application D1 binding is `DB`.

`.deployment/hosting.json` declares the logical build binding. `wrangler.d1.jsonc` is migration-only and must not be used to deploy the Worker.

```bash
# Local database
npx wrangler d1 migrations apply conti-in-chiaro-db --local --config wrangler.d1.jsonc

# Cloudflare database
npx wrangler d1 migrations apply conti-in-chiaro-db --remote --config wrangler.d1.jsonc
```

Apply remote migrations before deploying code that depends on new tables or columns.

### Enable Banking

1. Create an application in the Enable Banking Control Panel.
2. Open **Configuration → Enable Banking** and copy the Redirect, Privacy, and Terms URLs. They use the site's actual host.
3. Upload the Application ID and RSA PKCS#8 private key.
4. Verify the configuration.
5. Open an account's settings, select a bank, and complete authorization.
6. Synchronize from the dashboard and review transactions before importing.

Synchronization requests booked transactions only (`transaction_status=BOOK`). Pending (`PDNG`) transactions are neither requested nor imported.

Local callback testing requires a public HTTPS endpoint, such as a Cloudflare Tunnel, registered in the Enable Banking Control Panel.

### Security

- Passwords are derived with PBKDF2-SHA-256, a random salt, and 100,000 iterations; plain-text passwords are never stored.
- Sessions use random tokens, with only token hashes stored in the database.
- Cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`.
- Five failed login attempts trigger a temporary 15-minute lockout.
- Enable Banking private keys are validated and encrypted with AES-256-GCM and a random IV.
- Sensitive operations require authentication and same-origin validation.

`OPEN_BANKING_ENCRYPTION_KEY` must be a secret and must never be stored in the database or repository. Do not rotate it without a migration plan, or existing encrypted private keys will become unreadable.

The original password cannot be recovered. There is currently no self-service recovery flow; an administrative reset must generate a compatible new hash and salt.

### Cloudflare deployment

```bash
# Configure the production secret once
npx wrangler secret put OPEN_BANKING_ENCRYPTION_KEY

# Verify, migrate, and deploy
npm test
npx wrangler d1 migrations apply conti-in-chiaro-db --remote --config wrangler.d1.jsonc
npx wrangler deploy
```

The stable `workers.dev` domain is enabled and preview URLs are disabled in `wrangler.jsonc`.

After deployment, verify:

- the `DB` binding exists exactly once;
- `OPEN_BANKING_ENCRYPTION_KEY` is configured;
- Privacy, Terms, and callback URLs use the production host;
- login, imports, and synchronization work with a test account.

### Project structure

```text
src/app/                     Pages, dashboards, and API routes
src/app/api/open-banking/    Enable Banking configuration and synchronization
src/app/configurazione/      General and account-specific settings
src/components/              Shared components
src/db/schema.ts             Drizzle schema for D1
drizzle/                     SQL migrations
src/hooks/                   Shared React hooks
src/lib/                     Periods, cryptography, and banking client
scripts/                     Build and environment scripts
tests/                       Automated tests
src/worker/index.ts          Cloudflare Worker entry point
wrangler.jsonc               Build and deployment configuration
wrangler.d1.jsonc            D1 migration-only configuration
```

### Contributing

1. Create a focused branch.
2. Do not include generated files, databases, PEM files, or credentials.
3. Run `npm run lint` and `npm test`.
4. Document behavior, migrations, and security implications in the pull request.

### License

This project is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](LICENSE) for the full text and the terms governing use, modification, and distribution.
