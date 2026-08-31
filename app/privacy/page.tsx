import type { Metadata } from "next";
import { WalletCards } from "lucide-react";

export const metadata: Metadata = { title: "Privacy | Conti in Chiaro", description: "Informativa privacy di Conti in Chiaro." };

export default function PrivacyPage() {
  return <main className="legal-page"><article><a className="legal-brand" href="/"><WalletCards size={21}/> Conti in Chiaro</a><p className="eyebrow">INFORMATIVA</p><h1>Privacy</h1><p className="legal-updated">Ultimo aggiornamento: 31 agosto 2026</p>
    <section><h2>Dati trattati</h2><p>Conti in Chiaro tratta i dati dell’account, i conti e i movimenti inseriti dall’utente, le preferenze dell’applicazione e, quando l’integrazione è attivata, l’Application ID e la private key dell’applicazione Enable Banking.</p></section>
    <section><h2>Integrazione Enable Banking</h2><p>La private key caricata viene inviata al servizio esclusivamente tramite HTTPS, validata e cifrata prima della memorizzazione. Viene conservata solo in forma cifrata con AES-256-GCM e non viene mai mostrata nuovamente né restituita dalle API frontend.</p><p>Quando l’utente avvia un collegamento bancario, i dati necessari all’autenticazione e alle operazioni richieste possono essere trasmessi a Enable Banking e agli istituti selezionati. Il trattamento svolto da tali soggetti è disciplinato dalle rispettive informative.</p></section>
    <section><h2>Finalità e conservazione</h2><p>I dati sono utilizzati per fornire le funzionalità di gestione finanziaria richieste, proteggere l’accesso al servizio e mantenere le configurazioni dell’utente. La configurazione Enable Banking resta conservata finché l’utente non la rimuove dalla pagina Configurazione.</p></section>
    <section><h2>Sicurezza e diritti</h2><p>Le credenziali applicative sono protette con cifratura autenticata e una chiave principale conservata separatamente come secret dell’infrastruttura. L’utente può modificare o cancellare i dati disponibili attraverso le funzioni del sito.</p></section>
    <footer><a href="/terms">Termini di utilizzo</a><a href="/">Torna al sito</a></footer>
  </article></main>;
}
