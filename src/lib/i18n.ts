import { en } from "@/locales/en";
import { it } from "@/locales/it";

export type Locale = "it" | "en";
export const LOCALE_COOKIE = "conti_locale";
export const locales = { it, en } as const;
export type MessageKey = keyof typeof it.messages;

export function normalizeLocale(value?: string | null): Locale { return value === "en" ? "en" : "it"; }
export function message(locale: Locale, key: MessageKey): string { return locales[locale].messages[key]; }

const defaultCategoryTranslations: Record<string, string> = {
  Benzina: "Fuel", Spesa: "Groceries", Tabacco: "Tobacco", Condominio: "Condominium",
  "Mangiare fuori": "Eating out", Regali: "Gifts", "Shopping online": "Online shopping",
  "Shopping fisico": "In-store shopping", Farmacia: "Pharmacy", Animali: "Pets",
  Bollette: "Bills", Abbonamenti: "Subscriptions", Altro: "Other", Stipendio: "Salary",
  Rimborso: "Refund", Ricarica: "Top-up",
};

export function translateDefaultCategory(name: string, locale: Locale): string {
  return locale === "en" ? defaultCategoryTranslations[name] ?? name : name;
}

const englishReplacements: Array<readonly [string, string]> = [
  ...Object.keys(it.messages).map((key) => [it.messages[key as MessageKey], en.messages[key as MessageKey]] as const),
  ...[
    ["IL TUO QUADRO FINANZIARIO", "YOUR FINANCIAL OVERVIEW"],
    ["I dati sono visibili solo a te.", "Your data is visible only to you."],
    ["Apri menu", "Open menu"], ["Chiudi menu", "Close menu"], ["Navigazione principale", "Main navigation"],
    ["Filtra per conto", "Filter by account"], ["Periodo visualizzato", "Displayed period"],
    ["Mese precedente", "Previous month"], ["Mese successivo", "Next month"], ["Scegli periodo", "Choose period"], ["Scegli mese", "Choose month"],
    ["Tutti i conti", "All accounts"], ["Nuovo movimento", "New transaction"], ["Modifica movimento", "Edit transaction"],
    ["Caricamento del tuo quadro…", "Loading your overview…"], ["Saldo del conto", "Account balance"], ["Saldo mese", "Monthly balance"],
    ["Andamento", "Trend"], ["Ultimi sei mesi", "Last six months"], ["Dove vanno i tuoi soldi", "Where your money goes"],
    ["Spese per categoria", "Spending by category"], ["Cerca per descrizione, categoria, conto o importo…", "Search by description, category, account, or amount…"],
    ["Cerca nei movimenti del periodo", "Search this period's transactions"], ["Cancella ricerca", "Clear search"],
    ["Modifica movimento", "Edit transaction"], ["Elimina movimento", "Delete transaction"],
    ["Nessun movimento corrisponde alla ricerca.", "No transactions match your search."],
    ["Nessun movimento nel periodo", "No transactions in the period"], ["Aggiungine uno o importa l’estratto conto.", "Add one or import a statement."],
    ["Importo (negativo per una spesa)", "Amount (negative for an expense)"], ["Spesa fissa del mese", "Monthly fixed expense"],
    ["Nessuna spesa fissa", "No fixed expense"], ["Mostra solo le spese ancora da pagare per questo conto e mese.", "Only shows expenses still due for this account and month."],
    ["Nessuna spesa nel periodo selezionato.", "No expenses in the selected period."],
    ["Spese per categoria, scorri verticalmente per vederle tutte", "Spending by category; scroll vertically to view all"],
    ["Saldo del periodo", "Period balance"], ["Entrate del periodo", "Period income"], ["Uscite del periodo", "Period outgoings"],
    ["Movimenti del periodo", "Period transactions"], ["Dal primo venerdì al giovedì finale", "From the first Friday to the final Thursday"],
    ["Considerando", "Including"], ["di spese fisse non pagate", "in unpaid fixed expenses"],
    ["movimenti di spesa", "expense transactions"], ["rimasti dal periodo precedente", "carried over from the previous period"],
    ["Solo dal", "Only from"], ["SETTIMANA", "WEEK"], ["In corso", "Current"], ["Disponibile", "Available"], ["Speso", "Spent"],
    ["Quota settimanale", "Weekly allowance"], ["Risparmio del mese", "Monthly savings"],
    ["Senza sottrarre le spese fisse da pagare", "Before deducting fixed expenses due"], ["riservati per spese fisse", "reserved for fixed expenses"],
    ["Ultimi sei intervalli mensili", "Last six monthly periods"], ["Saldo residuo", "Remaining balance"],
    ["Andamento e risparmio mensile", "Monthly balance and savings trend"], ["Fine", "End of"],
    ["OBIETTIVO RISPARMIO", "SAVINGS GOAL"], ["Obiettivo di risparmio in euro", "Savings goal in euros"],
    ["raggiunto", "reached"], ["Imposta il tuo traguardo", "Set your goal"], ["Mancano", "You need"], ["per arrivare a", "to reach"],
    ["Dai un obiettivo a questo conto e segui i progressi nel tempo.", "Set a goal for this account and track progress over time."],
    ["Modifica obiettivo", "Edit goal"], ["Imposta obiettivo", "Set goal"], ["Crescita del conto", "Account growth"],
    ["Saldo negli ultimi mesi", "Balance over recent months"], ["Conto di destinazione", "Destination account"],
    ["Seleziona un conto", "Select an account"], ["Nessun movimento disponibile nel periodo selezionato.", "No transactions are available for the selected period."],
    ["Escluso", "Excluded"], ["Sarà aggiornato con i nuovi dettagli", "Will be updated with the new details"],
    ["Aggiornamento disponibile", "Update available"], ["Sarà aggiornato", "Will be updated"], ["Sarà importato", "Will be imported"],
    ["Conferma aggiornamento", "Confirm update"], ["Conferma spesa fissa", "Confirm fixed expense"], ["Importa comunque", "Import anyway"],
    ["Note (facoltative)", "Notes (optional)"], ["Aggiungi dettagli utili sulla spesa fissa", "Add useful details about the fixed expense"],
    ["Nessun movimento in questo filtro.", "No transactions in this filter."],
    ["I movimenti evidenziati saranno importati. Puoi escludere quelli che non vuoi salvare; i duplicati restano esclusi salvo “Importa comunque”.", "Highlighted transactions will be imported. You can exclude any you do not want to save; duplicates remain excluded unless you select ‘Import anyway’."],
    ["movimento", "transaction"], ["movimenti", "transactions"], ["Eliminare il movimento", "Delete transaction"], ["Movimento eliminato.", "Transaction deleted."], ["Movimento aggiornato", "Transaction updated"],
    ["Il periodo selezionato non è ancora iniziato.", "The selected period has not started yet."], ["Saldo banca", "Bank balance"],
    ["Collegamento Enable Banking", "Enable Banking connection"], ["Associa questo conto a una banca italiana usando i nomi ufficiali forniti da Enable Banking.", "Link this account to an Italian bank using the official names provided by Enable Banking."],
    ["Abilitato", "Enabled"], ["Collegato a", "Linked to"], ["Identificativo conto", "Account identifier"], ["Scollega", "Disconnect"],
    ["Conto autorizzato", "Authorized account"], ["Completa collegamento", "Complete connection"], ["Tipo di accesso", "Access type"],
    ["Aziendale", "Business"], ["Preparazione…", "Preparing…"], ["Collega banca", "Link bank"], ["Collegamento rimosso.", "Connection removed."],
    ["I tuoi conti", "Your accounts"], ["Conto in home page", "Home-page account"], ["Le tue categorie", "Your categories"],
    ["Preferenza salvata", "Preference saved"], ["Potrai sempre cambiare conto dalla home page.", "You can always change the account from the home page."],
    ["parole chiave", "keywords"], ["Nessuna parola chiave", "No keywords"], ["Le modifiche sono immediate.", "Changes take effect immediately."],
    ["Se rinomini una categoria, aggiorniamo anche tutti i movimenti già associati.", "Renaming a category also updates all transactions already assigned to it."],
    ["AREA PERICOLOSA", "DANGER ZONE"], ["Queste operazioni sono definitive e richiedono una conferma scritta.", "These actions are permanent and require written confirmation."],
    ["Cancella movimenti", "Delete transactions"], ["Scegli il conto e il periodo da cancellare. Sono incluse entrambe le date.", "Choose the account and date range to delete. Both dates are included."],
    ["Conto da cui cancellare i movimenti", "Account whose transactions will be deleted"], ["Dal", "From"], ["Cancella tutto", "Delete everything"],
    ["Elimina tutti i conti, i movimenti e i budget. Le categorie restano disponibili.", "Deletes all accounts, transactions, and budgets. Categories remain available."],
    ["Parole chiave", "Keywords"], ["Se la descrizione contiene una di queste parole, verrà proposta questa categoria.", "If the description contains one of these words, this category will be suggested."],
    ["Nessuna parola chiave impostata.", "No keywords set."], ["Colore", "Color"], ["Personalizzato", "Custom"], ["Salva modifiche", "Save changes"], ["Crea categoria", "Create category"],
    ["Aggiungi parola chiave", "Add keyword"], ["Nessuna parola chiave in blacklist.", "No blacklisted keywords."], ["Nome del conto", "Account name"],
    ["Tipologia", "Type"], ["Es. Conto principale", "E.g. Main account"], ["Aggiungi un conto", "Add an account"], ["Nessun conto configurato.", "No accounts configured."],
    ["Prima di procedere alla configurazione, bisogna configurare correttamente l’account Enable Banking.", "Before continuing, set up your Enable Banking account correctly."],
    ["Accedi al Control Panel Enable Banking e crea l’applicazione.", "Sign in to the Enable Banking Control Panel and create the application."],
    ["Configura nell’applicazione gli URL indicati qui sotto e abilita l’accesso alle banche che vuoi collegare.", "Configure the URLs shown below in the application and enable access to the banks you want to link."],
    ["Conserva l’Application ID e la private key PEM PKCS#8 generata: inseriscili qui e verifica la configurazione.", "Keep the generated Application ID and PEM PKCS#8 private key, enter them here, and verify the configuration."],
    ["Apri le impostazioni di ciascun conto, scegli la banca e completa l’autorizzazione.", "Open each account's settings, choose the bank, and complete authorization."],
    ["Configura questi indirizzi nel pannello Enable Banking:", "Configure these addresses in the Enable Banking panel:"],
    ["Credenziali dell’applicazione", "Application credentials"], ["Inserisci i dati generati nel pannello Enable Banking. Potrai modificarli solo dopo aver disabilitato l’integrazione.", "Enter the details generated in the Enable Banking panel. You can change them only after disabling the integration."],
    ["L’identificativo UUID assegnato alla tua applicazione.", "The UUID assigned to your application."], ["Seleziona il file .pem", "Select the .pem file"],
    ["pronto per il caricamento", "ready to upload"], ["Fai clic per scegliere la private key PKCS#8", "Click to choose the PKCS#8 private key"], ["Cambia file", "Change file"], ["Sfoglia", "Browse"],
    ["La chiave verrà cifrata immediatamente e non sarà mai più mostrata.", "The key will be encrypted immediately and never displayed again."],
    ["Disattivazione…", "Disabling…"], ["Salvataggio…", "Saving…"], ["Configurazione salvata in modo sicuro.", "Configuration saved securely."],
    ["Configurazione verificata con Enable Banking.", "Configuration verified with Enable Banking."], ["Salvataggio non riuscito", "Could not save"], ["Disattivazione non riuscita", "Could not disable"],
    ["Integrazione Enable Banking", "Enable Banking integration"], ["Es. Animali", "E.g. Pets"], ["Es. supermercato", "E.g. supermarket"],
    ["Rimuovi", "Remove"], ["Cancellazione dati", "Data deletion"], ["Sezioni configurazione", "Configuration sections"],
    ["IMPOSTAZIONI CONTO", "ACCOUNT SETTINGS"], ["Gestisci le opzioni specifiche di questo conto.", "Manage this account's specific options."],
    ["Indietro", "Back"], ["Conto non trovato.", "Account not found."], ["Spese fisse mensili", "Monthly fixed expenses"],
    ["Gli importi ancora da pagare vengono riservati nel calcolo del saldo spendibile.", "Amounts still due are reserved when calculating the spendable balance."],
    ["Le spese fisse sono disponibili solo per conti Personale e Spese mese.", "Fixed expenses are available only for Personal and Monthly expenses accounts."],
    ["Qualsiasi categoria", "Any category"], ["Disabilitata", "Disabled"], ["Pagata", "Paid"], ["Saltata", "Skipped"], ["Da pagare", "Due"],
    ["Modifica nome, importo e categoria", "Edit name, amount, and category"], ["Riattiva", "Re-enable"], ["Disabilita", "Disable"],
    ["Ripristina da pagare", "Mark as due again"], ["Ripristina", "Restore"], ["Ricerca…", "Searching…"], ["Ricerca spesa nel conto", "Search for expense in account"],
    ["Salta mese", "Skip month"], ["Movimenti più simili del mese", "Most similar transactions this month"], ["Ricerca in corso…", "Searching…"],
    ["Segna come pagata", "Mark as paid"], ["Nessun movimento compatibile trovato nel mese corrente.", "No matching transactions found in the current month."],
    ["Nessuna spesa fissa configurata.", "No fixed expenses configured."], ["Aggiungi spesa fissa", "Add fixed expense"], ["Nuova spesa fissa", "New fixed expense"],
    ["Modifica spesa fissa", "Edit fixed expense"], ["Importo previsto", "Expected amount"], ["Nessuna parola chiave configurata.", "No keywords configured."],
    ["Spesa fissa non disponibile", "Fixed expense unavailable"], ["Eliminare la spesa fissa", "Delete fixed expense"],
    ["Conto bancario collegato.", "Bank account linked."], ["L’autorizzazione con", "The authorization with"],
    ["include più conti. Scegli quale associare:", "includes multiple accounts. Choose which one to link:"],
    ["Scollegare questo conto da Enable Banking? I movimenti già importati resteranno disponibili.", "Disconnect this account from Enable Banking? Previously imported transactions will remain available."],
    ["Conti in Chiaro", "Clear Accounts"], ["Ciao,", "Hello,"],
    ["Black list parole chiave categorie", "Category keyword blacklist"], ["Black list parole chiave spese fisse", "Fixed-expense keyword blacklist"],
    ["Queste parole non vengono usate per assegnare automaticamente le categorie.", "These words are not used to assign categories automatically."],
    ["Queste parole non vengono usate per associare automaticamente le spese fisse.", "These words are not used to match fixed expenses automatically."],
    ["Rimuovere", "Remove"], ["dalla blacklist?", "from the blacklist?"], ["dalla blacklist", "from the blacklist"],
    ["Delta previsto, al netto di", "Forecast change, after deducting"], ["ancora da pagare", "still due"],
    ["Delta rispetto al saldo del mese precedente", "Change from the previous month's balance"],
    ["Il file non viene importato subito: controlla un esempio dei dati, poi scegli se accettare o rifiutare.", "The file is not imported immediately: review a sample of the data, then choose whether to accept or reject it."],
    ["I movimenti recuperati non sono ancora stati salvati: controlla duplicati, categorie e spese fisse, poi conferma l’importazione.", "The retrieved transactions have not been saved yet: review duplicates, categories, and fixed expenses, then confirm the import."],
    ["Scegli l’estratto conto", "Choose the bank statement"], ["CSV o XLSX, prima riga con intestazioni", "CSV or XLSX with headers in the first row"],
    ["movimenti riconosciuti", "transactions recognized"], ["da importare", "to import"], ["duplicati esclusi", "duplicates excluded"],
    ["Filtra movimenti dell'importazione", "Filter imported transactions"], ["Non importare questo movimento", "Do not import this transaction"],
    ["Potenziali duplicati", "Potential duplicates"], ["Potenziale duplicato: stessa data e stesso importo, con alcune parole in comune. Il movimento verrà comunque importato.", "Potential duplicate: same date and amount, with some words in common. The transaction will still be imported."],
    ["Potenziale duplicato di:", "Potential duplicate of:"], ["Importa come nuovo", "Import as new"], ["Escludi", "Exclude"], ["Aggiorna esistente", "Update existing"],
    ["Sarà escluso", "Will be excluded"], ["Aggiornerà l’esistente", "Will update the existing transaction"], ["Sarà importato come nuovo", "Will be imported as new"],
    ["Rifiuta importazione", "Reject import"], ["Nome della nuova categoria", "New category name"],
  ] as Array<readonly [string, string]>,
].sort((left, right) => right[0].length - left[0].length);

export function translateItalianText(value: string, locale: Locale): string {
  if (locale === "it" || !value.trim()) return value;
  return englishReplacements.reduce((text, [source, target]) => {
    const straight = text.split(source).join(target);
    return straight.split(source.replaceAll("'", "’")).join(target);
  }, value);
}
