"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, History, Mail, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_TIMES } from "@/lib/mail-schedule";
import { ENERGY_PROVIDERS, GMAIL_ONLY_MESSAGE, SUPPLY_LABELS, isGmailAddress, isSupply } from "@/lib/energy-providers";

type Bill = { id: number; supply: string; consumption: number | null; consumptionUnit: string | null; total: number | null; dueDate: string | null; periodLabel: string | null; appliedAt: string | null; appliedMonth: string | null; note: string | null };
type Summary = { read: number; ignored: number; added: number; updated?: number; applied: number; notes: string[]; full?: boolean };
type Config = { provider: string; email: string; hasPassword: boolean; times: string[]; enabled: boolean; lastRunAt: string | null; lastSuccessAt: string | null; lastStatus: string | null; lastError: string | null; running: boolean; pendingRun: boolean; summary: Summary | null };
type Period = { month: string; months: string[]; current: string; start: string | null; end: string | null };
type Status = { config: Config | null; bills: Bill[]; period: Period; pendingBills: number };

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value)) : "—";
const NO_DUE_DATE = "senza-scadenza";
const monthTitle = (month: string) => month === NO_DUE_DATE ? "Senza scadenza" : new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
const dayMonth = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";

export default function AccountEnergyMailSettings({ accountId, onApplied }: { accountId: number; onApplied?: () => void | Promise<void> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState(ENERGY_PROVIDERS[0].id as string);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [times, setTimes] = useState<string[]>([...DEFAULT_TIMES]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState<string | null>(null); // null = periodo attuale del conto
  const [periodLoading, setPeriodLoading] = useState(false);
  const [error, setError] = useState("");
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasWorking = useRef(false);
  const formFilled = useRef(false);
  const monthRef = useRef<string | null>(null);
  const withMonth = (path: string) => `${path}${monthRef.current ? `?month=${monthRef.current}` : ""}`;

  const applyStatus = useCallback((data: Status, fillForm: boolean) => {
    setStatus(data);
    if (fillForm && data.config) {
      setProvider(data.config.provider); setEmail(data.config.email); setEnabled(data.config.enabled);
      setTimes([data.config.times[0] || DEFAULT_TIMES[0], data.config.times[1] || DEFAULT_TIMES[1]]);
    }
  }, []);

  const load = useCallback(async (fillForm = false) => {
    const response = await fetch(`/api/energy-mail/${accountId}${monthRef.current ? `?month=${monthRef.current}` : ""}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as Status;
    applyStatus(data, fillForm);
    return data;
  }, [accountId, applyStatus]);

  // Carica la pagina del periodo richiesto (di default l'attuale); il modulo si compila solo la prima volta.
  useEffect(() => {
    let cancelled = false;
    monthRef.current = month;
    fetch(`/api/energy-mail/${accountId}${month ? `?month=${month}` : ""}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Status> : null)
      .then((data) => { if (data && !cancelled) { applyStatus(data, !formFilled.current); formFilled.current = true; } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPeriodLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, month, applyStatus]);

  const working = Boolean(status?.config && (status.config.running || status.config.pendingRun));
  useEffect(() => {
    if (polling.current) clearTimeout(polling.current);
    if (working) { wasWorking.current = true; polling.current = setTimeout(() => { void load(); }, 3000); }
    else if (wasWorking.current) { wasWorking.current = false; void onApplied?.(); }
    return () => { if (polling.current) clearTimeout(polling.current); };
  }, [working, status, load, onApplied]);

  const emailInvalid = email.trim() !== "" && !isGmailAddress(email);
  const call = async (method: string, body?: unknown) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(withMonth(`/api/energy-mail/${accountId}`), { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Operazione non riuscita"); return null; }
      return data;
    } catch { setError("Operazione non riuscita. Controlla la connessione e riprova."); return null; }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!isGmailAddress(email)) { setError(GMAIL_ONLY_MESSAGE); return; }
    const data = await call("PUT", { provider, email, password, times, enabled });
    if (data) { applyStatus(data, true); setPassword(""); setMessage("Configurazione salvata."); }
  };
  const run = async () => {
    const data = await call("POST", { action: "run" });
    if (data) { applyStatus(data, false); setMessage("Lettura avviata: i risultati compaiono qui sotto tra pochi secondi."); }
  };
  const fullScan = async () => {
    if (!confirm("Avviare la scansione completa? Vengono riletti tutti i messaggi del fornitore in ogni cartella di Gmail (spam e cestino compresi) e completati i dati mancanti delle bollette già salvate. Può richiedere qualche minuto.")) return;
    const data = await call("POST", { action: "full-scan" });
    if (data) { applyStatus(data, false); setMessage("Scansione completa avviata: i risultati compaiono qui sotto."); }
  };
  const reapply = async () => {
    const data = await call("POST", { action: "apply" });
    if (data) { applyStatus(data, false); setMessage("Bollette riapplicate."); await onApplied?.(); }
  };
  const remove = async () => {
    if (!confirm("Rimuovere la configurazione della lettura email? Le bollette già lette restano salvate.")) return;
    const data = await call("DELETE");
    if (data) { setStatus((current) => current ? { ...current, config: null } : current); setEmail(""); setPassword(""); setMessage("Configurazione rimossa."); }
  };

  const config = status?.config || null;
  const summary = config?.summary || null;
  const pending = status?.pendingBills ?? 0;

  return <section className="settings-panel energy-mail-panel">
    <div className="settings-heading"><div><h2><Mail size={19}/> Lettura email delle bollette</h2><p>Legge le email del fornitore (luce e gas) e aggiorna l’importo previsto delle bollette nel periodo del conto.</p></div>{config && <span className={`integration-status ${config.lastStatus === "error" ? "status-invalid" : "status-valid"}`}>{config.enabled ? "Attiva" : "In pausa"}</span>}</div>
    <div className="energy-mail-body">
      <div className="energy-mail-grid">
        <label className="field"><span>Fornitore di energia</span><select value={provider} onChange={(event) => setProvider(event.target.value)}>{ENERGY_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="field"><span>Email di lettura (solo Gmail)</span><input type="email" inputMode="email" autoComplete="off" placeholder="nome@gmail.com" value={email} aria-invalid={emailInvalid} onChange={(event) => { setEmail(event.target.value); setError(""); }}/>{emailInvalid && <small className="field-error" role="alert">{GMAIL_ONLY_MESSAGE}: questa casella non può essere configurata.</small>}</label>
        <label className="field"><span>Password per le app di Google</span><input type="password" autoComplete="new-password" placeholder={config?.hasPassword ? "•••• salvata — lascia vuoto per non cambiarla" : config ? "Da reinserire (non è inclusa nel backup)" : "16 lettere, senza spazi"} value={password} onChange={(event) => setPassword(event.target.value)}/></label>
        <div className="energy-mail-times"><label className="field"><span>Primo orario</span><input type="time" value={times[0]} onChange={(event) => setTimes([event.target.value, times[1]])}/></label><label className="field"><span>Secondo orario</span><input type="time" value={times[1]} onChange={(event) => setTimes([times[0], event.target.value])}/></label></div>
      </div>
      <details className="energy-mail-help"><summary>Come ottengo la password per le app?</summary><ol><li>Nel tuo account Google attiva la <b>verifica in 2 passaggi</b> (Sicurezza).</li><li>Apri <b>Password per le app</b>, crea una password (nome a piacere) e copiala.</li><li>Incollala qui: viene salvata cifrata e usata solo per leggere le email.</li></ol></details>
      <div className="switch-row"><div><strong>Lettura automatica attiva</strong><small>Parte negli orari indicati (fuso Italia). Cerca in tutte le cartelle di Gmail, spam e cestino compresi. La prima volta legge tutta la casella, poi solo le email del giorno; “Scansione completa” rilegge tutto.</small></div><Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Lettura automatica attiva"/></div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && !error && <p className="success" role="status">{message}</p>}
      <div className="energy-mail-actions">
        <Button type="button" disabled={busy || emailInvalid || !email} onClick={save}>Salva configurazione</Button>
        <Button type="button" variant="outline" disabled={busy || !config || working} onClick={run}>{working ? <><RefreshCw size={15} className="spin"/> In corso…</> : <><Play size={15}/> Avvia ora</>}</Button>
        <Button type="button" variant="outline" disabled={busy || !config || working} onClick={fullScan} title="Rilegge tutte le email del fornitore in tutte le cartelle e completa i dati mancanti"><History size={15}/> Scansione completa</Button>
        {pending > 0 && <Button type="button" variant="outline" disabled={busy} onClick={reapply}>Riapplica bollette lette</Button>}
        {config && <Button type="button" variant="outline" className="danger-outline" disabled={busy} onClick={remove}><Trash2 size={15}/> Rimuovi</Button>}
      </div>
      {config && <div className="energy-mail-status">
        <p><b>Ultima esecuzione:</b> {dateTime(config.lastRunAt)} {config.lastStatus === "ok" ? "· riuscita" : config.lastStatus === "error" ? "· con errore" : ""}</p>
        {config.lastError && <p className="error">{config.lastError}</p>}
        {summary && <p>{summary.full ? "Scansione completa: " : ""}{summary.read} email lette · {summary.added} nuove · {summary.updated ? `${summary.updated} aggiornate · ` : ""}{summary.ignored} ignorate · {summary.applied} bollette applicate{summary.notes?.length ? ` · ${summary.notes.join("; ")}` : ""}</p>}
      </div>}
      {status && (config || status.bills.length > 0) && (() => {
        const period = status.period, months = period.months, index = months.indexOf(period.month);
        const go = (target: string | undefined) => { if (target) { setPeriodLoading(true); setMonth(target === period.current ? null : target); } };
        return <div className="energy-bills">
          <h3>Bollette lette · {monthTitle(period.month)}</h3>
          <nav className="energy-bills-pager" aria-label="Periodo delle bollette">
            <Button type="button" variant="outline" size="sm" disabled={periodLoading || index >= months.length - 1} onClick={() => go(months[index + 1])} aria-label="Periodo precedente"><ChevronLeft size={15}/> <span>Precedente</span></Button>
            <label className="energy-bills-page-select"><select aria-label="Scegli il periodo" value={period.month} disabled={periodLoading} onChange={(event) => go(event.target.value)}>{months.map((item) => <option key={item} value={item}>{monthTitle(item)}{item === period.current ? " (attuale)" : ""}</option>)}</select></label>
            <Button type="button" variant="outline" size="sm" disabled={periodLoading || index <= 0} onClick={() => go(months[index - 1])} aria-label="Periodo successivo"><span>Successivo</span> <ChevronRight size={15}/></Button>
          </nav>
          {period.start && period.end && <p className="energy-bills-range">Periodo del conto: {dayMonth(period.start)} – {dayMonth(period.end)}</p>}
          <div className={`energy-bills-list${periodLoading ? " loading" : ""}`} aria-busy={periodLoading}>
            {status.bills.map((bill) => <div className="energy-bill-row" key={bill.id}>
              <span className="tag">{isSupply(bill.supply) ? SUPPLY_LABELS[bill.supply] : bill.supply}</span>
              <strong>{bill.total === null ? "—" : eur.format(bill.total)}</strong>
              <small>{bill.consumption !== null ? `${bill.consumption.toLocaleString("it-IT")} ${bill.consumptionUnit || ""}` : "consumo n.d."}{bill.periodLabel ? ` · ${bill.periodLabel}` : ""}</small>
              <span>Scad. {shortDate(bill.dueDate)}</span>
              <em className={bill.appliedAt ? "applied" : "waiting"}>{bill.appliedAt ? "Applicata" : bill.note || "In attesa del suo periodo"}</em>
            </div>)}
            {!status.bills.length && <p className="muted">Nessuna bolletta letta per questo periodo.</p>}
          </div>
        </div>;
      })()}
    </div>
  </section>;
}
