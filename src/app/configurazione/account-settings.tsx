"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Search, Settings, Trash2, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionDescription } from "@/components/transaction-description";
import { useLocale } from "@/components/locale-provider";
import AccountOpenBankingSettings from "./account-open-banking-settings";
import { accountCycleMonth } from "@/lib/account-period";
import { normalizeKeyword } from "@/lib/keyword-policy";
import { translateDefaultCategory } from "@/lib/i18n";

type Account = { id: number; name: string; type: string };
type Category = { id: number; name: string };
type FixedExpense = { id: number; accountId: number; name: string; notes?: string | null; category: string | null; keywords: string[]; amount: number; active: boolean; payments: Array<{ month: string; transactionId: number }>; skippedMonths: string[] };
type Match = { id: number; date: string; description: string; details?: string | null; amount: number; category: string };
const currentMonth = (type = "personale") => accountCycleMonth(new Date().toISOString().slice(0, 10), type);
const formatDate = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));

export default function AccountSettings({ accountId }: { accountId: number }) {
  const { locale } = useLocale();
  const [account, setAccount] = useState<Account | null>(null), [categories, setCategories] = useState<Category[]>([]), [expenses, setExpenses] = useState<FixedExpense[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [searchingId, setSearchingId] = useState<number | null>(null), [searchExpense, setSearchExpense] = useState<FixedExpense | null>(null), [matches, setMatches] = useState<Match[]>([]);
  const [editingExpense, setEditingExpense] = useState<FixedExpense | null>(null);
  const load = async () => { setLoading(true); const data = await fetch("/api/data").then((response) => response.json()); setAccount((data.accounts || []).find((item: Account) => item.id === accountId) || null); setCategories(data.categories || []); setExpenses((data.fixedExpenses || []).filter((item: FixedExpense) => item.accountId === accountId)); setLoading(false); };
  useEffect(() => { load(); }, [accountId]);
  const post = async (body: Record<string, unknown>) => { const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) setError(data.error || "Operazione non riuscita"); return data; };
  const add = async (name: string, amount: string, category: string, keywords: string[], notes: string): Promise<true | string> => { const data = await post({ action: "fixed-expense", accountId, name, notes, amount: Number(amount.replace(",", ".")), category, keywords }); if (data.error) return String(data.error); const match = data.possibleTransactions?.[0]; if (match && confirm(`Il movimento “${match.description}” da € ${Math.abs(match.amount).toFixed(2)} sembra corrispondere. Confermi che questa spesa fissa è già pagata?`)) await post({ action: "fixed-expense-paid", fixedExpenseId: data.row.id, transactionId: match.id }); setError(""); await load(); return true; };
  const saveEdit = async (name: string, amount: string, category: string, keywords: string[], notes: string): Promise<true | string> => { if (!editingExpense) return "Spesa fissa non disponibile"; const data = await post({ action: "fixed-expense-update", id: editingExpense.id, name, notes, amount: Number(amount.replace(",", ".")), category, keywords }); if (data.error) return String(data.error); setEditingExpense(null); setError(""); await load(); return true; };
  const editExpense = (expense: FixedExpense) => setEditingExpense(expense);
  const toggleActive = async (expense: FixedExpense) => { const active = expense.active === false; if (!active && !confirm(`Disabilitare definitivamente la spesa fissa “${expense.name}”? Potrai riattivarla dalle impostazioni.`)) return; const data = await post({ action: "fixed-expense-active", id: expense.id, active }); if (!data.error) { setError(""); await load(); } };
  const toggleSkip = async (expense: FixedExpense) => { await post({ action: "fixed-expense-skip", id: expense.id, month: currentMonth(account?.type) }); await load(); };
  const restoreUnpaid = async (expense: FixedExpense) => { await post({ action: "fixed-expense-unpaid", id: expense.id, month: currentMonth(account?.type) }); await load(); };
  const searchTransactions = async (expense: FixedExpense) => { setSearchingId(expense.id); setSearchExpense(expense); setMatches([]); const data = await post({ action: "fixed-expense-search", id: expense.id, month: currentMonth(account?.type) }); if (!data.error) setMatches(data.matches || []); setSearchingId(null); };
  const markPaid = async (transactionId: number) => { if (!searchExpense) return; const data = await post({ action: "fixed-expense-paid", fixedExpenseId: searchExpense.id, transactionId }); if (data.error) return; setSearchExpense(null); setMatches([]); setError(""); await load(); };
  const remove = async (expense: FixedExpense) => { if (!confirm(`Eliminare la spesa fissa “${expense.name}”?`)) return; await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "fixed-expense", id: expense.id }) }); await load(); };

  if (editingExpense) return <Dialog open onOpenChange={(open) => { if (!open) setEditingExpense(null); }}><DialogContent><DialogHeader><DialogTitle>Modifica spesa fissa</DialogTitle></DialogHeader><FixedExpenseForm key={editingExpense.id} categories={categories} initial={editingExpense} save={saveEdit}/></DialogContent></Dialog>;

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><WalletCards size={21}/></span><span>Conti in Chiaro</span></div><nav><a href="/"><ArrowLeft size={15}/> Panoramica</a><a href="/configurazione"><Settings size={15}/> Configurazione</a></nav></aside><section className="content settings-content"><header><div><p className="eyebrow">IMPOSTAZIONI CONTO</p><h1>{account?.name || "Conto"}</h1><p className="page-intro">Gestisci le opzioni specifiche di questo conto.</p></div><Button variant="outline" onClick={() => history.back()}><ArrowLeft size={15}/> Indietro</Button></header>{error && <div className="notice error-notice">{error}</div>}{loading ? <div className="empty">Caricamento…</div> : !account ? <div className="empty">Conto non trovato.</div> : <><AccountOpenBankingSettings accountId={accountId}/><section className="settings-panel fixed-expenses-panel"><div className="settings-heading"><div><h2>Spese fisse mensili</h2><p>Gli importi ancora da pagare vengono riservati nel calcolo del saldo spendibile.</p></div></div>{account.type === "risparmi" ? <p className="fixed-expense-empty">Le spese fisse sono disponibili solo per conti Personale e Spese mese.</p> : <><FixedExpenseForm categories={categories} save={add}/><div className="fixed-expense-list">{expenses.map((expense) => {
    const cycleMonth = currentMonth(account.type), paid = expense.payments.some((payment) => payment.month === cycleMonth), skipped = expense.skippedMonths?.includes(cycleMonth);
    return <article className="fixed-expense-row" key={expense.id}><div className="fixed-expense-main"><strong>{expense.name}</strong><small>{expense.category || "Qualsiasi categoria"}</small>{expense.notes && <p className="fixed-expense-notes">{expense.notes}</p>}</div><strong className="fixed-expense-amount">€ {expense.amount.toFixed(2)}</strong><span className={`fixed-expense-status ${expense.active === false ? "skipped" : paid ? "paid" : skipped ? "skipped" : "pending"}`}>{expense.active === false ? "Disabilitata" : paid ? "Pagata" : skipped ? "Saltata" : "Da pagare"}</span><div className="fixed-expense-actions"><button type="button" title="Modifica nome, importo, categoria e note" onClick={() => editExpense(expense)}><Pencil size={15}/></button><button type="button" onClick={() => toggleActive(expense)}>{expense.active === false ? "Riattiva" : "Disabilita"}</button>{expense.active !== false && paid && <button type="button" onClick={() => restoreUnpaid(expense)}>Ripristina da pagare</button>}{expense.active !== false && !paid && skipped && <button type="button" onClick={() => toggleSkip(expense)}>Ripristina</button>}{expense.active !== false && !paid && !skipped && <><button type="button" onClick={() => searchTransactions(expense)}><Search size={14}/> {searchingId === expense.id ? "Ricerca…" : "Ricerca spesa nel conto"}</button><button type="button" onClick={() => toggleSkip(expense)}>Salta mese</button></>}<button className="danger" title="Elimina" onClick={() => remove(expense)}><Trash2 size={16}/></button></div>{expense.active !== false && searchExpense?.id === expense.id && <div className="fixed-expense-matches"><div className="fixed-expense-matches-heading"><strong>Movimenti più simili del mese</strong><button type="button" onClick={() => setSearchExpense(null)}>Chiudi</button></div>{searchingId === expense.id ? <p>Ricerca in corso…</p> : matches.length ? matches.map((match) => <div className="fixed-expense-match" key={match.id}><div><TransactionDescription description={match.description} details={match.details}/><small>{formatDate(match.date)} · {match.category}</small></div><strong>€ {Math.abs(match.amount).toFixed(2)}</strong><button type="button" onClick={() => markPaid(match.id)}>Segna come pagata</button></div>) : <p>Nessun movimento compatibile trovato nel mese corrente.</p>}</div>}</article>;
  })}{!expenses.length && <p className="fixed-expense-empty">Nessuna spesa fissa configurata.</p>}</div></>}</section></>}</section></main>;
}

type FixedExpenseSave = (name: string, amount: string, category: string, keywords: string[], notes: string) => Promise<true | string>;

function FixedExpenseForm({ categories, save, initial }: { categories: Category[]; save: FixedExpenseSave; initial?: FixedExpense }) {
  const [open, setOpen] = useState(false);

  if (initial) return <FixedExpenseEditor categories={categories} save={save} initial={initial}/>;

  return <>
    <Button type="button" onClick={() => setOpen(true)}><Plus size={15}/> Aggiungi spesa fissa</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuova spesa fissa</DialogTitle></DialogHeader>
        <FixedExpenseEditor categories={categories} save={async (...values) => {
          const saved = await save(...values);
          if (saved === true) setOpen(false);
          return saved;
        }}/>
      </DialogContent>
    </Dialog>
  </>;
}

function FixedExpenseEditor({ categories, save, initial }: { categories: Category[]; save: FixedExpenseSave; initial?: FixedExpense }) {
  const { locale } = useLocale();
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial ? initial.amount.toFixed(2) : "");
  const [category, setCategory] = useState(initial?.category || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords || []);
  const [keyword, setKeyword] = useState("");
  const [formError, setFormError] = useState("");

  const normalizedKeyword = () => normalizeKeyword(keyword);
  const addKeyword = () => {
    const value = normalizedKeyword();
    if (value && !keywords.includes(value)) setKeywords((current) => [...current, value]);
    setKeyword("");
  };
  const keywordsToSave = () => {
    const pending = normalizedKeyword();
    return pending && !keywords.includes(pending) ? [...keywords, pending] : keywords;
  };

  return <form className="form" onSubmit={async (event) => {
    event.preventDefault();
    const saved = await save(name, amount, category, keywordsToSave(), notes);
    if (saved === true) {
      setName("");
      setAmount("");
      setCategory("");
      setNotes("");
      setKeywords([]);
      setKeyword("");
      setFormError("");
    } else setFormError(saved);
  }}>
    <label className="field"><span>Nome</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. Affitto"/></label>
    <label className="field"><span>Importo previsto</span><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)}/></label>
    <label className="field"><span>Categoria (facoltativa)</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Qualsiasi categoria</option>{categories.map((item) => <option data-no-translate value={item.name} key={item.id}>{translateDefaultCategory(item.name, locale)}</option>)}</select></label>
    <label className="field"><span>Note (facoltative)</span><textarea value={notes} maxLength={2000} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder="Aggiungi dettagli utili sulla spesa fissa"/></label>
    <fieldset className="keyword-field">
      <legend>Parole chiave (facoltative)</legend>
      <p>Nome e parole chiave vengono cercati nella descrizione e nel dettaglio del movimento.</p>
      <div className="keyword-editor">
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} placeholder="Es. netflix"/>
        <Button type="button" variant="outline" onClick={addKeyword} disabled={!keyword.trim()}><Plus size={14}/> Aggiungi</Button>
      </div>
      <div className="keyword-list">
        {keywords.map((item) => <span className="keyword-chip" key={item}>{item}<button type="button" aria-label={`Rimuovi ${item}`} onClick={() => setKeywords((current) => current.filter((value) => value !== item))}><X size={13}/></button></span>)}
        {!keywords.length && <small>Nessuna parola chiave configurata.</small>}
      </div>
    </fieldset>
    {formError && <p className="error">{formError}</p>}
    <Button>{initial ? <Pencil size={15}/> : <Plus size={15}/>} {initial ? "Salva modifiche" : "Crea spesa fissa"}</Button>
  </form>;
}
