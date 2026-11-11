# Conti in Chiaro

Applicazione web full-stack per gestire conti personali, movimenti, budget, risparmi e spese fisse. Include importazioni CSV/XLSX per banca, categorizzazione tramite parole chiave, bollette variabili di luce e gas aggiornate dalle email del fornitore e integrazione Open Banking con Enable Banking.

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
- Ogni conto ha una **banca** (Intesa Sanpaolo, Hype, Revolut) scelta alla creazione e modificabile dalla Configurazione: l'importazione usa il formato di quella banca (vedi [Banche e importazione](#banche-e-importazione-degli-estratti-conto)). I conti senza banca usano il riconoscimento generico delle intestazioni.
- Importazione dei movimenti contabilizzati (`BOOK`) tramite Enable Banking.
- Riconoscimento dei duplicati tra inserimenti manuali, file ed Enable Banking.
- Aggiornamenti non distruttivi quando una nuova fonte fornisce maggiori informazioni.
- Categorie personalizzate con parole chiave e blacklist.
- Spese fisse attivabili, disattivabili o ignorabili per un periodo, con possibilità di spostarle su un altro conto.
- Associazione delle spese fisse tramite importo, descrizione, dettaglio e parole chiave.
- Previsioni dei saldi al netto delle spese fisse ancora da pagare.
- **Bollette variabili luce e gas**: sezione dedicata nelle impostazioni del conto, con importo previsto diverso per ogni periodo, seconda bolletta nello stesso periodo e fornitura (Luce/Gas) (vedi [Bollette variabili](#bollette-variabili-luce-e-gas)).
- **Lettura automatica delle email** del fornitore di energia (Octopus Energy, via Gmail) che aggiorna da sola gli importi previsti (vedi [Lettura delle email](#lettura-automatica-delle-email-delle-bollette)).
- Navigazione dei periodi che salta quelli senza movimenti nei conti Spese mese e Risparmi.
- Scheda "Movimenti per categoria" con il totale di uscite o entrate, nelle viste Personale e Spese mese.
- Esportazione e importazione dei dati (backup JSON) che conserva movimenti identici nello stesso file e include bollette luce/gas (importi per periodo, bollette extra, fornitura), bollette lette dalle email e configurazione della lettura email (senza la password per le app).
- Interfaccia ottimizzata per desktop e dispositivi mobili: sui conti Personale grafico dell'andamento e movimenti per categoria sono affiancati; su smartphone la tabella dei movimenti sta nella larghezza dello schermo e il testo va a capo.
- Interfaccia multilingua in italiano e inglese, selezionabile dalla pagina Configurazione e memorizzata nel browser.

### Stack

- React 19, Next.js 16 e Vinext.
- TypeScript e Vite.
- Cloudflare Workers e Static Assets.
- Cloudflare D1 con Drizzle ORM.
- Tailwind CSS e componenti shadcn/Base UI.
- Recharts.
- Web Crypto API.
- `imapflow` e `mailparser` per la lettura IMAP delle email delle bollette (worker Node nel container Docker).

### Requisiti

- Node.js `>= 22.13.0` e npm.
- Account Cloudflare con Workers e D1.
- Facoltativamente, account Enable Banking con Application ID e private key RSA PKCS#8 PEM.
- Facoltativamente, per la lettura delle email delle bollette: una casella Gmail con verifica in 2 passaggi e una "password per le app".

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

### Banche e importazione degli estratti conto

La banca si sceglie alla creazione del conto (obbligatoria) e si può cambiare dalla **Configurazione**; l'elenco è in `src/lib/banks.ts`. I parser stanno in `src/lib/statement-import.ts`.

| Banca | File | Colonne usate |
| --- | --- | --- |
| Intesa Sanpaolo | XLSX | Data (seriale Excel), Operazione, Dettagli, Importo; le righe di preambolo vengono saltate |
| Hype | CSV | Data operazione, Descrizione, Importo ( € ) |
| Revolut | CSV | Data di inizio, Descrizione, Importo, Costo, Valuta, State |

- Revolut: si importano solo i movimenti `COMPLETATO` in EUR e l'importo finale è **Importo − Costo**.
- Se il file non ha l'estensione della banca del conto (per esempio un CSV su un conto Intesa) l'importazione mostra un errore.
- Per aggiungere una banca: una voce in `banks.ts` e un profilo in `statement-import.ts`.

### Bollette variabili luce e gas

Nelle impostazioni dei conti Personale e Spese mese le spese fisse si dividono in due sezioni: **Spese fisse mensili** (importo costante) e **Bollette variabili luce e gas** (importo diverso ogni periodo).

- Un interruttore "Bolletta luce/gas a importo variabile" sposta una spesa fissa nella sezione delle bollette; ogni bolletta ha una **Fornitura** (Luce, Gas o nessuna), usata dalla lettura delle email.
- L'importo previsto di un periodo è, in ordine: il valore di quel periodo (a mano o scritto dal servizio) → la bolletta letta dalle email per quel periodo → lo stesso mese dell'anno prima (valore salvato, bolletta letta o importo pagato) → l'ultimo valore precedente → l'importo iniziale. Quando conosci l'importo reale modifichi la spesa e il valore vale solo per quel periodo.
- **Bolletta extra**: se in un periodo arrivano due bollette della stessa fornitura, il pulsante "Bolletta extra questo mese" (o il servizio email) crea una seconda bolletta valida solo per quel periodo. Eredita le parole chiave della bolletta originale, non modificabili e senza controllo dei conflitti; eliminando l'originale vengono eliminate anche le extra.
- Riserva sul saldo, abbinamento ai movimenti, "segna come pagata" e "salta periodo" funzionano come per le spese fisse.

### Lettura automatica delle email delle bollette

Nelle impostazioni di un conto Personale o Spese mese la sezione **Lettura email delle bollette** legge le email del fornitore e aggiorna le bollette variabili.

**Configurazione** (per conto): fornitore (per ora solo **Octopus Energy**), indirizzo di lettura (per ora **solo Gmail**; altri indirizzi vengono rifiutati), password per le app di Google, due orari giornalieri (predefiniti **12:00 e 23:30**, fuso Europe/Rome) e interruttore di attivazione. La password per le app si crea in Google → Sicurezza → verifica in 2 passaggi → Password per le app; viene salvata cifrata con AES-256-GCM (`OPEN_BANKING_ENCRYPTION_KEY`) e non viene mai mostrata.

**Cosa legge**
- Tutte le cartelle di Gmail, **spam e cestino compresi**, con le regole del fornitore: mittente `octopusenergy.it` e oggetto che contiene `La tua bolletta Octopus Energy - Luce` oppure `… - Gas` (anche con altro testo, per esempio `INFO - ⚡️ …`).
- Per ogni email: fornitura, consumo fatturato, totale da pagare e scadenza. Ogni email si salva una volta sola nella tabella `energy_bills` per identificativo (Message-ID); email diverse con gli stessi importi restano entrambe.
- **Prima esecuzione**: tutta la casella. **Successive**: solo le email del giorno corrente.
- **Scansione completa** (pulsante): rilegge tutto e completa i dati mancanti delle bollette già salvate senza modificare quelli presenti. **Avvia ora**: esecuzione manuale immediata. Se il container resta spento, le email di quel giorno si recuperano con la scansione completa.

**Cosa aggiorna**
- Applica solo le bollette la cui **scadenza cade nel periodo attuale** del conto (periodo contabile, non mese solare): scrive il totale nell'importo del periodo della bolletta con la stessa fornitura. Dalla seconda bolletta della stessa fornitura nello stesso periodo usa la bolletta extra. Le altre restano salvate e si applicano quando il loro periodo diventa quello attuale.
- Se non esiste una bolletta variabile con quella fornitura, l'email resta salvata con una nota e non cambia nulla.

**Backup**: l'esportazione include le bollette lette (`energy_bills`) e la configurazione (fornitore, email, orari, stato), ma **non la password per le app**. All'importazione le bollette già presenti (stesso identificativo email) vengono saltate, i collegamenti alle spese vengono rimappati e la configurazione arriva **disattivata e senza password**: reinseriscila nelle impostazioni del conto e salva. La prima lettura dopo il ripristino legge di nuovo tutta la casella.

**Architettura**: la lettura IMAP la fa `scripts/mail-sync-worker.mjs`, un processo Node avviato dall'entrypoint Docker accanto al server dell'app. Ogni 30 secondi chiede a `/api/internal/mail-sync/due` quali configurazioni sono da eseguire, legge la casella e invia le email a `/api/internal/mail-sync/result`, che le interpreta (`src/lib/octopus-bill.ts`), le salva e applica gli importi (`src/lib/mail-sync.ts`). Gli endpoint interni accettano solo il token `MAIL_SYNC_TOKEN`, generato dall'entrypoint nel volume dati.

> La lettura automatica funziona nell'esecuzione **Docker**. Con Cloudflare Workers la sezione di configurazione è disponibile ma non c'è uno scheduler né la lettura IMAP.

### Sicurezza

- Password derivate con PBKDF2-SHA-256, salt casuale e 100.000 iterazioni; nessuna password è salvata in chiaro.
- Token di sessione casuali con solo l'hash conservato nel database.
- Cookie `HttpOnly`, `Secure` in produzione e `SameSite=Lax`.
- Blocco temporaneo di 15 minuti dopo cinque accessi falliti.
- Private key Enable Banking validata e cifrata con AES-256-GCM e IV casuale.
- Password per le app di Google cifrata con AES-256-GCM, mai restituita dalle API e inviata solo al worker locale tramite un endpoint protetto da token.
- Operazioni sensibili protette da autenticazione e verifica della stessa origine.

`OPEN_BANKING_ENCRYPTION_KEY` deve essere un secret e non deve essere salvato nel database o nel repository. Non cambiarlo senza una migrazione: le private key già cifrate non sarebbero più decifrabili.

La password originale non è recuperabile. Non è ancora presente un flusso self-service di recupero; un reset amministrativo deve generare un nuovo hash e un nuovo salt compatibili.

### Esecuzione locale con Docker

```bash
docker compose up -d --build   # in background: il terminale si può chiudere
docker compose logs -f            # per vedere i log (Ctrl+C esce senza fermare nulla)
docker compose down               # ferma i container (i dati restano nel volume)
```

Con `-d` i container restano attivi anche se chiudi il terminale e, grazie a `restart: unless-stopped`, ripartono dopo un riavvio del PC o di Docker: serve perché la lettura delle email delle bollette gira alle 12:00 e alle 23:30. Senza `-d` i log occupano il terminale e chiuderlo ferma tutto.

Apri <http://localhost:5173> (o <http://localhost>). Per usare HTTPS autofirmato avvia con `DEV_HTTP=0 docker compose up -d --build` e apri <https://localhost:5173>. Il codice è copiato nell'immagine: dopo ogni modifica ripeti `docker compose up --build` (senza cache se l'immagine non cambia).

All'avvio l'entrypoint (`docker/entrypoint.sh`, sempre con fine riga LF grazie a `.gitattributes`):
- genera, se mancano, la chiave `OPEN_BANKING_ENCRYPTION_KEY` e il token `MAIL_SYNC_TOKEN` (nel volume `data`; sono passabili anche come variabili d'ambiente) e li scrive in `.dev.vars`;
- applica le migrazioni al database D1 locale, salvato nel volume `data`;
- avvia il worker di lettura email e poi il server.

`TZ=Europe/Rome` è impostato nel compose per gli orari della lettura email. `docker compose down -v` cancella anche il database locale.

**Su un server**: per aprire il sito da un indirizzo diverso da `localhost` indica host, IP o dominio in `ALLOWED_HOSTS` (separati da virgola), per esempio `ALLOWED_HOSTS="conti.example.com,192.168.1.20" docker compose up -d --build` (oppure in un file `.env` accanto al compose). Senza, Vite risponde "Blocked request. This host is not allowed". `ALLOWED_HOSTS="*"` accetta qualsiasi host ed è meno sicuro. Il sito parte in HTTP sulle porte 5173 e 80: per esporlo su Internet mettilo dietro un reverse proxy HTTPS (Caddy, nginx, Traefik) che inoltri `X-Forwarded-Proto` e `X-Forwarded-Host`; il cookie di sessione diventa così `Secure`. Non esporre la porta direttamente senza HTTPS.

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
src/app/api/energy-mail/     Configurazione e stato della lettura email delle bollette
src/app/api/internal/        Endpoint del worker di lettura email (solo con token)
src/app/configurazione/      Impostazioni generali e dei conti
src/components/              Componenti condivisi
src/db/schema.ts             Schema Drizzle per D1
drizzle/                     Migrazioni SQL
src/hooks/                   Hook React condivisi
src/lib/                     Periodi, crittografia, client bancario, banche e importazione,
                             importi delle bollette, parser Octopus, pianificazione email
scripts/                     Script di build, ambiente e worker di lettura email
docker/                      Entrypoint del container
input_file_example/          Estratti conto di esempio (esclusi da git e dall'immagine)
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
- Each account has a **bank** (Intesa Sanpaolo, Hype, Revolut) chosen at creation and editable from Configuration: imports use that bank's file format (see [Banks and statement import](#banks-and-statement-import)). Accounts without a bank use generic header detection.
- Enable Banking imports for booked (`BOOK`) transactions.
- Duplicate detection across manual entries, files, and Enable Banking.
- Non-destructive updates when a source provides additional information.
- Custom categories with keywords and blacklists.
- Fixed expenses that can be enabled, permanently disabled, skipped for one period, or moved to another account.
- Fixed-expense matching by amount, description, details, and keywords.
- Balance forecasts accounting for unpaid fixed expenses.
- **Variable electricity and gas bills**: a dedicated section in account settings with a different expected amount per period, a second bill within the same period, and a supply (Electricity/Gas) (see [Variable bills](#variable-electricity-and-gas-bills)).
- **Automatic email reading** for the energy supplier (Octopus Energy, via Gmail) that updates expected amounts on its own (see [Email reading](#automatic-bill-email-reading)).
- Period navigation that skips periods without transactions in Monthly-expenses and Savings accounts.
- A "Transactions by category" card showing the expense or income total in the Personal and Monthly-expenses views.
- Data export/import (JSON backup) that keeps identical transactions inside the same file and includes electricity/gas bills (per-period amounts, extra bills, supply), bills read from email, and the email-reading configuration (without the app password).
- Desktop and mobile-optimized interface: on Personal accounts the trend chart and the category card sit side by side; on smartphones the transactions table fits the screen width and text wraps.
- Multilingual Italian and English interface, selectable from Configuration and persisted in the browser.

### Technology stack

- React 19, Next.js 16, and Vinext.
- TypeScript and Vite.
- Cloudflare Workers and Static Assets.
- Cloudflare D1 with Drizzle ORM.
- Tailwind CSS and shadcn/Base UI components.
- Recharts.
- Web Crypto API.
- `imapflow` and `mailparser` to read bill emails over IMAP (Node worker in the Docker container).

### Requirements

- Node.js `>= 22.13.0` and npm.
- A Cloudflare account with Workers and D1.
- Optionally, an Enable Banking account, Application ID, and RSA PKCS#8 PEM private key.
- Optionally, for bill email reading: a Gmail mailbox with 2-step verification and an "app password".

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

### Banks and statement import

The bank is chosen when the account is created (required) and can be changed from **Configuration**; the list lives in `src/lib/banks.ts` and the parsers in `src/lib/statement-import.ts`.

| Bank | File | Columns used |
| --- | --- | --- |
| Intesa Sanpaolo | XLSX | Date (Excel serial), Operation, Details, Amount; preamble rows are skipped |
| Hype | CSV | Operation date, Description, Amount ( € ) |
| Revolut | CSV | Start date, Description, Amount, Fee, Currency, State |

- Revolut: only `COMPLETED` EUR movements are imported and the final amount is **Amount − Fee**.
- A file whose extension does not match the account's bank (for example a CSV on an Intesa account) is rejected with an error.
- To add a bank: an entry in `banks.ts` and a profile in `statement-import.ts`.

### Variable electricity and gas bills

In Personal and Monthly-expenses account settings, fixed expenses are split into **Monthly fixed expenses** (constant amount) and **Variable electricity and gas bills** (a different amount every period).

- A "Variable-amount electricity/gas bill" switch moves a fixed expense to the bills section; each bill has a **Supply** (Electricity, Gas, or none) used by email reading.
- The expected amount for a period is, in order: that period's value (manual or written by the service) → the bill read from email for that period → the same month last year (saved value, read bill, or paid amount) → the latest earlier value → the initial amount. When you know the real amount, edit the expense: the value applies to that period only.
- **Extra bill**: if two bills of the same supply arrive in one period, the "Extra bill this month" button (or the email service) creates a second bill valid for that period only. It inherits the original bill's keywords, which cannot be edited and skip conflict checks; deleting the original deletes its extra bills.
- Balance reservation, transaction matching, "mark as paid", and "skip period" work as for fixed expenses.

### Automatic bill email reading

In a Personal or Monthly-expenses account's settings, the **Bill email reading** section reads the supplier's emails and updates the variable bills.

**Configuration** (per account): supplier (currently **Octopus Energy** only), reading address (currently **Gmail only**; other addresses are rejected), a Google app password, two daily times (default **12:00 and 23:30**, Europe/Rome), and an on/off switch. Create the app password in Google → Security → 2-step verification → App passwords; it is stored encrypted with AES-256-GCM (`OPEN_BANKING_ENCRYPTION_KEY`) and never displayed.

**What it reads**
- Every Gmail folder, **including spam and trash**, using the supplier's rules: sender `octopusenergy.it` and a subject containing `La tua bolletta Octopus Energy - Luce` or `… - Gas` (other text around it is fine, e.g. `INFO - ⚡️ …`).
- For each email: supply, billed consumption, total due, and due date. Each email is stored once in the `energy_bills` table by its identifier (Message-ID); different emails with identical amounts are both kept.
- **First run**: the whole mailbox. **Later runs**: only emails from the current day.
- **Full scan** (button): rereads everything and fills in missing data on bills already stored without altering existing values. **Run now**: immediate manual run. If the container was down, that day's emails are recovered with a full scan.

**What it updates**
- It applies only bills whose **due date falls in the account's current period** (accounting period, not calendar month): the total is written to that period's amount of the bill with the same supply. From the second bill of the same supply in the same period it uses the extra bill. Others stay stored and are applied when their period becomes current.
- If no variable bill has that supply, the email is kept with a note and nothing changes.

**Backup**: the export includes the bills read (`energy_bills`) and the configuration (supplier, email, times, state) but **not the app password**. On import, bills already present (same email identifier) are skipped, links to expenses are remapped, and the configuration arrives **disabled and without a password**: re-enter it in the account settings and save. The first read after a restore reads the whole mailbox again.

**Architecture**: IMAP reading is done by `scripts/mail-sync-worker.mjs`, a Node process started by the Docker entrypoint next to the app server. Every 30 seconds it asks `/api/internal/mail-sync/due` which configurations should run, reads the mailbox, and posts the emails to `/api/internal/mail-sync/result`, which parses them (`src/lib/octopus-bill.ts`), stores them, and applies the amounts (`src/lib/mail-sync.ts`). The internal endpoints accept only the `MAIL_SYNC_TOKEN` token, generated by the entrypoint in the data volume.

> Automatic reading works in the **Docker** setup. On Cloudflare Workers the configuration section is available but there is no scheduler or IMAP reading.

### Security

- Passwords are derived with PBKDF2-SHA-256, a random salt, and 100,000 iterations; plain-text passwords are never stored.
- Sessions use random tokens, with only token hashes stored in the database.
- Cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`.
- Five failed login attempts trigger a temporary 15-minute lockout.
- Enable Banking private keys are validated and encrypted with AES-256-GCM and a random IV.
- The Google app password is encrypted with AES-256-GCM, never returned by the APIs, and sent only to the local worker through a token-protected endpoint.
- Sensitive operations require authentication and same-origin validation.

`OPEN_BANKING_ENCRYPTION_KEY` must be a secret and must never be stored in the database or repository. Do not rotate it without a migration plan, or existing encrypted private keys will become unreadable.

The original password cannot be recovered. There is currently no self-service recovery flow; an administrative reset must generate a compatible new hash and salt.

### Running locally with Docker

```bash
docker compose up -d --build   # in the background: you can close the terminal
docker compose logs -f            # follow the logs (Ctrl+C leaves everything running)
docker compose down               # stop the containers (data stays in the volume)
```

With `-d` the containers keep running after you close the terminal and, thanks to `restart: unless-stopped`, come back after a PC or Docker restart: this matters because bill email reading runs at 12:00 and 23:30. Without `-d` the logs occupy the terminal and closing it stops everything.

Open <http://localhost:5173> (or <http://localhost>). For self-signed HTTPS run `DEV_HTTP=0 docker compose up -d --build` and open <https://localhost:5173>. The code is copied into the image: after any change run `docker compose up --build` again (without cache if the image does not change).

On startup the entrypoint (`docker/entrypoint.sh`, always LF line endings thanks to `.gitattributes`):
- generates, if missing, the `OPEN_BANKING_ENCRYPTION_KEY` key and the `MAIL_SYNC_TOKEN` token (in the `data` volume; both can also be passed as environment variables) and writes them to `.dev.vars`;
- applies migrations to the local D1 database, stored in the `data` volume;
- starts the email-reading worker and then the server.

`TZ=Europe/Rome` is set in the compose file for the email-reading schedule. `docker compose down -v` also deletes the local database.

**On a server**: to open the site from an address other than `localhost`, list the host, IP, or domain in `ALLOWED_HOSTS` (comma-separated), for example `ALLOWED_HOSTS="conti.example.com,192.168.1.20" docker compose up -d --build` (or in a `.env` file next to the compose file). Without it, Vite answers "Blocked request. This host is not allowed". `ALLOWED_HOSTS="*"` accepts any host and is less safe. The site starts over HTTP on ports 5173 and 80: to expose it on the Internet put it behind an HTTPS reverse proxy (Caddy, nginx, Traefik) that forwards `X-Forwarded-Proto` and `X-Forwarded-Host`; the session cookie then becomes `Secure`. Do not expose the port directly without HTTPS.

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
src/app/api/energy-mail/     Bill email reading configuration and status
src/app/api/internal/        Email-reading worker endpoints (token only)
src/app/configurazione/      General and account-specific settings
src/components/              Shared components
src/db/schema.ts             Drizzle schema for D1
drizzle/                     SQL migrations
src/hooks/                   Shared React hooks
src/lib/                     Periods, cryptography, banking client, banks and import,
                             bill amounts, Octopus parser, email scheduling
scripts/                     Build, environment, and email-reading worker scripts
docker/                      Container entrypoint
input_file_example/          Sample statements (excluded from git and from the image)
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
