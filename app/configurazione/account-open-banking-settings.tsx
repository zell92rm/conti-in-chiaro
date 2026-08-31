"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Aspsp = { name: string; country: string; psuTypes: Array<"personal" | "business">; beta: boolean; bic: string | null };
type Status = { enabled: boolean; link: null | { bankName: string; bankCountry: string; accountUid: string; status: string }; pending: null | { authorizationId: number; bankName: string; accounts: Array<{ uid: string; label: string }> } };

export default function AccountOpenBankingSettings({ accountId }: { accountId: number }) {
  const [available, setAvailable] = useState<boolean | null>(null), [status, setStatus] = useState<Status | null>(null), [banks, setBanks] = useState<Aspsp[]>([]), [bankName, setBankName] = useState(""), [psuType, setPsuType] = useState<"personal" | "business">("personal"), [candidate, setCandidate] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [localAccountName, setLocalAccountName] = useState("");
  const selectedBank = useMemo(() => banks.find(bank => bank.name === bankName), [banks, bankName]);
  const load = async () => { const [configResponse, accountResponse] = await Promise.all([fetch("/api/open-banking/enable-banking"), fetch("/api/data")]); const config = await configResponse.json(); const accountData = await accountResponse.json(); setLocalAccountName(accountData.accounts?.find((account: { id: number; name: string }) => account.id === accountId)?.name || ""); const enabled = configResponse.ok && config.configured === true && (config.status === "CONFIGURED" || config.status === "VALID"); setAvailable(enabled); if (!enabled) { setStatus(null); return; } const response = await fetch(`/api/open-banking/accounts/${accountId}`); const data = await response.json(); setStatus(data); if (data.pending?.accounts?.length) setCandidate(data.pending.accounts[0].uid); };
  useEffect(() => { load(); }, [accountId]);
  useEffect(() => { if (available !== true || status?.enabled || status?.pending || banks.length || !localAccountName) return; fetch("/api/open-banking/aspsps").then(async response => ({ ok: response.ok, data: await response.json() })).then(({ ok, data }) => { if (ok) { const availableBanks: Aspsp[] = data.aspsps || []; setBanks(availableBanks); setBankName(bestMatchingBank(localAccountName, availableBanks)?.name || availableBanks[0]?.name || ""); } else setMessage(data.error || "Elenco banche non disponibile"); }); }, [available, status, banks.length, localAccountName]);
  useEffect(() => { if (selectedBank && !selectedBank.psuTypes.includes(psuType)) setPsuType(selectedBank.psuTypes[0] || "personal"); }, [selectedBank, psuType]);
  const authorize = async () => { setBusy(true); setMessage(""); const response = await fetch(`/api/open-banking/accounts/${accountId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "authorize", bankName, psuType }) }); const data = await response.json(); setBusy(false); if (!response.ok) return setMessage(data.error || "Collegamento non riuscito"); window.location.assign(data.url); };
  const selectAccount = async () => { if (!status?.pending || !candidate) return; setBusy(true); const response = await fetch(`/api/open-banking/accounts/${accountId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-account", authorizationId: status.pending.authorizationId, accountUid: candidate }) }); const data = await response.json(); setBusy(false); if (!response.ok) return setMessage(data.error); setMessage("Conto bancario collegato."); await load(); };
  const disconnect = async () => { if (!confirm("Scollegare questo conto da Enable Banking? I movimenti già importati resteranno disponibili.")) return; setBusy(true); const response = await fetch(`/api/open-banking/accounts/${accountId}`, { method: "DELETE" }); setBusy(false); if (response.ok) { setStatus({ enabled: false, link: null, pending: null }); setMessage("Collegamento rimosso."); } };
  if (available !== true) return null;
  return <section className="settings-panel bank-link-panel"><div className="settings-heading"><div><h2><Building2 size={19}/> Collegamento Enable Banking</h2><p>Associa questo conto a una banca italiana usando i nomi ufficiali forniti da Enable Banking.</p></div>{status?.enabled && <span className="integration-status status-valid">Abilitato</span>}</div>
    {!status ? <div className="empty">Caricamento…</div> : status.enabled ? <div className="bank-linked"><p><Check size={16}/> Collegato a <strong>{status.link?.bankName}</strong></p><small>Identificativo conto: {status.link?.accountUid.slice(0, 8)}…</small><Button variant="outline" disabled={busy} onClick={disconnect}><Unlink size={15}/> Scollega</Button></div> : status.pending ? <div className="bank-connect-form"><p>L’autorizzazione con <strong>{status.pending.bankName}</strong> include più conti. Scegli quale associare:</p><label className="field"><span>Conto autorizzato</span><select value={candidate} onChange={event => setCandidate(event.target.value)}>{status.pending.accounts.map(account => <option value={account.uid} key={account.uid}>{account.label}</option>)}</select></label><Button disabled={busy || !candidate} onClick={selectAccount}><Link2 size={15}/> Completa collegamento</Button></div> : <div className="bank-connect-form"><label className="field"><span>Banca</span><select value={bankName} disabled={!banks.length || busy} onChange={event => setBankName(event.target.value)}>{banks.map(bank => <option value={bank.name} key={`${bank.country}:${bank.name}`}>{bank.name}{bank.beta ? " (beta)" : ""}</option>)}</select></label><label className="field"><span>Tipo di accesso</span><select value={psuType} disabled={!selectedBank || busy} onChange={event => setPsuType(event.target.value as "personal" | "business")}>{selectedBank?.psuTypes.includes("personal") && <option value="personal">Personale</option>}{selectedBank?.psuTypes.includes("business") && <option value="business">Aziendale</option>}</select></label><Button disabled={busy || !bankName || !selectedBank?.psuTypes.length} onClick={authorize}>{busy ? <RefreshCw size={15}/> : <Link2 size={15}/>} {busy ? "Preparazione…" : "Collega banca"}</Button></div>}
    {message && <p className="integration-message" role="status">{message}</p>}
  </section>;
}

function bestMatchingBank(accountName: string, banks: Aspsp[]) {
  const target = comparableName(accountName);
  if (!target) return undefined;
  const scored = banks.map(bank => ({ bank, score: nameSimilarity(target, comparableName(bank.name)) })).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 0.6 ? scored[0].bank : undefined;
}

function comparableName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/\b(conto corrente|conto|banca|bank|personale|spese|risparmi)\b/g, " ").replace(/[^a-z0-9]/g, "").trim();
}

function nameSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.2;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const current = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = current;
    }
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
}
