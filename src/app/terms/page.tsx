import type { Metadata } from "next";
import { WalletCards } from "lucide-react";

export const metadata: Metadata = { title: "Termini | Conti in Chiaro", description: "Termini di utilizzo di Conti in Chiaro." };

export default function TermsPage() {
  return <main className="legal-page"><article><a className="legal-brand" href="/"><WalletCards size={21}/> Conti in Chiaro</a><p className="eyebrow">CONDIZIONI DEL SERVIZIO</p><h1>Termini di utilizzo</h1><p className="legal-updated">Ultimo aggiornamento: 31 agosto 2026</p>
    <section><h2>Uso del servizio</h2><p>Conti in Chiaro è uno strumento di organizzazione e consultazione delle proprie informazioni finanziarie. L’utente è responsabile dell’accuratezza dei dati inseriti e della custodia delle credenziali di accesso.</p></section>
    <section><h2>Enable Banking</h2><p>L’integrazione con Enable Banking è facoltativa. L’utente deve utilizzare un’Application ID e una private key che è autorizzato a usare e configurare correttamente nel pannello Enable Banking gli URL di reindirizzamento, privacy e termini indicati dal sito.</p><p>L’accesso ai conti dipende dalla disponibilità di Enable Banking e degli istituti finanziari coinvolti, nonché dai consensi concessi dall’utente presso tali soggetti.</p></section>
    <section><h2>Nessuna consulenza finanziaria</h2><p>Le informazioni mostrate hanno finalità organizzative e non costituiscono consulenza finanziaria, fiscale, contabile o legale. Prima di prendere decisioni finanziarie è opportuno verificare i dati presso la propria banca.</p></section>
    <section><h2>Disponibilità e responsabilità</h2><p>Il servizio può essere aggiornato, sospeso o modificato per esigenze tecniche o di sicurezza. Salvo quanto inderogabilmente previsto dalla legge, non è garantita la disponibilità ininterrotta dei servizi di terze parti.</p></section>
    <footer><a href="/privacy">Privacy</a><a href="/">Torna al sito</a></footer>
  </article></main>;
}
