"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  RefreshCw,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDescription } from "@/components/transaction-description";
import { useLocale } from "@/components/locale-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { accountCycleMonth, accountPeriodBounds } from "@/lib/account-period";
import { translateDefaultCategory } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Account = {
  id: number;
  name: string;
  color: string;
  type: "personale" | "risparmi" | "spese_mese";
  savingsGoal: number | null;
};
type Tx = {
  id: number;
  accountId: number;
  date: string;
  description: string;
  details?: string | null;
  amount: number;
  category: string;
  source: string;
  externalTransactionId?: string | null;
  openBankingStatus?: "BOOK" | "PDNG" | null;
  spreadAcrossWeeks: boolean;
  fixedExpenseId?: number | null;
};
type Category = { id: number; name: string; color: string; keywords?: string[] };
type FixedExpense = { id:number; accountId:number; name:string; category:string|null; keywords:string[]; amount:number; active:boolean; payments:Array<{month:string;transactionId:number}>; skippedMonths:string[] };
const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
const compactEur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
export default function ExpenseApp({ displayName }: { displayName: string }) {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const monthName = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", {
    month: "long",
    year: "numeric",
  }), [locale]);
  const [accounts, setAccounts] = useState<Account[]>([]),
    [txs, setTxs] = useState<Tx[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [txOpen, setTxOpen] = useState(false), [importOpen, setImportOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [savingCategoryIds, setSavingCategoryIds] = useState<Set<number>>(new Set());
  const [savingSpreadIds, setSavingSpreadIds] = useState<Set<number>>(new Set());
  const [deletingTransactionIds, setDeletingTransactionIds] = useState<Set<number>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bankLinks, setBankLinks] = useState<Record<number, string>>({}), [syncingBank, setSyncingBank] = useState(false);
  const [bankImport, setBankImport] = useState<null | { accountId: number; rows: Array<{ date: string; description: string; details?: string; amount: number; category: string; externalTransactionId?: string }>; balance: { amount: number; currency: string } | null }>(null);
  const [dashboardTab, setDashboardTab] = useState<"movimenti">("movimenti");
  const hasLoadedData = useRef(false);
  const configuredHomeAccount = useRef("all");
  const transactionsPanelRef = useRef<HTMLElement | null>(null);
  const load = async () => {
    const isInitialLoad = !hasLoadedData.current;
    hasLoadedData.current = true;
    setLoading(true);
    const r = await fetch("/api/data");
    const d = await r.json();
    setAccounts(d.accounts || []);
    setTxs(d.transactions || []);
    setCategories(d.categories || []);
    setFixedExpenses(d.fixedExpenses || []);
    const linksResponse = await fetch("/api/open-banking/accounts");
    if (linksResponse.ok) {
      const linksData = await linksResponse.json();
      setBankLinks(Object.fromEntries((linksData.links || []).filter((link: { status: string }) => link.status === "ENABLED").map((link: { accountId: number; bankName: string }) => [link.accountId, link.bankName])));
    }
    if (isInitialLoad) {
      configuredHomeAccount.current = d.homeAccountId == null ? "all" : String(d.homeAccountId);
      setAccountFilter(configuredHomeAccount.current);
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);
  useLayoutEffect(() => {
    const panel = transactionsPanelRef.current;
    if (!panel) return;
    panel.scrollTop = 0;
    const frame = requestAnimationFrame(() => { panel.scrollTop = 0; });
    return () => cancelAnimationFrame(frame);
  }, [transactionSearch, month, accountFilter]);
  const viewTxs = useMemo(
    () =>
      accountFilter === "all"
        ? txs
        : txs.filter((t) => t.accountId === Number(accountFilter)),
    [txs, accountFilter],
  );
  const viewAccounts = useMemo(
    () =>
      accountFilter === "all"
        ? accounts
        : accounts.filter((a) => a.id === Number(accountFilter)),
    [accounts, accountFilter],
  );
  const selectedAccount = accountFilter === "all" ? null : viewAccounts[0] || null;
  const today = new Date().toISOString().slice(0, 10);
  const latestDashboardMonth = selectedAccount
    ? accountCycleMonth(today, selectedAccount.type)
    : today.slice(0, 7);
  const availableExpenseMonths = useMemo(() => {
    if (selectedAccount?.type !== "spese_mese") return [];
    return Array.from(new Set(viewTxs.map((transaction) => movementCycleMonth(transaction.date, selectedAccount))))
      .filter((availableMonth) => availableMonth <= latestDashboardMonth)
      .sort();
  }, [viewTxs, selectedAccount, latestDashboardMonth]);
  useEffect(() => {
    setMonth(latestDashboardMonth);
  }, [selectedAccount?.id, selectedAccount?.type, latestDashboardMonth]);
  useEffect(() => {
    if (month > latestDashboardMonth) setMonth(latestDashboardMonth);
  }, [month, latestDashboardMonth]);
  useEffect(() => {
    if (selectedAccount?.type === "spese_mese" && availableExpenseMonths.length && !availableExpenseMonths.includes(month))
      setMonth(availableExpenseMonths.at(-1)!);
  }, [selectedAccount, availableExpenseMonths, month]);
  const period = useMemo(() => dashboardPeriod(month, selectedAccount), [month, selectedAccount]);
  const current = useMemo(
    () => viewTxs.filter((t) => t.date >= period.start && t.date <= period.end),
    [viewTxs, period],
  );
  const visibleTransactions = useMemo(() => {
    const query = compactSearchText(transactionSearch);
    if (!query) return current;
    return current.filter((transaction) => {
      const accountName = accounts.find((account) => account.id === transaction.accountId)?.name || "";
      const localizedCategory = translateDefaultCategory(transaction.category, locale);
      return [transaction.description, localizedCategory, accountName, transaction.date, ...transactionAmountSearchValues(transaction.amount)]
        .some((value) => compactSearchText(value).indexOf(query) !== -1);
    });
  }, [current, transactionSearch, accounts, locale]);
  useEffect(() => {
    if (!transactionSearch) return;
    const normalizedQuery = compactSearchText(transactionSearch);
    const diagnostics = current.map((transaction) => {
      const accountName = accounts.find((account) => account.id === transaction.accountId)?.name || "";
      const searchableFields = {
        description: compactSearchText(transaction.description),
        category: compactSearchText(transaction.category),
        account: compactSearchText(accountName),
        date: compactSearchText(transaction.date),
        amount: transactionAmountSearchValues(transaction.amount).map(compactSearchText).join(" "),
      };
      const matchingFields = Object.entries(searchableFields).filter(([, value]) => value.includes(normalizedQuery)).map(([field]) => field);
      return {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        normalizedDescription: searchableFields.description,
        query: normalizedQuery,
        matches: matchingFields.length > 0,
        matchingFields: matchingFields.join(", ") || "—",
      };
    });
    console.groupCollapsed(`[Ricerca movimenti] “${transactionSearch}” → “${normalizedQuery}”`);
    console.log("Conto selezionato:", selectedAccount?.name || "Tutti i conti", accountFilter);
    console.log("Periodo:", period.start, "→", period.end);
    console.log("Movimenti nel periodo:", current.length, "Risultati:", visibleTransactions.length);
    console.table(diagnostics);
    console.log("Risultati completi:", visibleTransactions);
    console.groupEnd();
  }, [transactionSearch, current, visibleTransactions, accounts, selectedAccount, accountFilter, period]);
  const moveMonth = (offset: number) => {
    if (selectedAccount?.type === "spese_mese") {
      const currentIndex = availableExpenseMonths.indexOf(month);
      const target = availableExpenseMonths[currentIndex + offset];
      if (target) setMonth(target);
      return;
    }
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    const target = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (target <= latestDashboardMonth) setMonth(target);
  };
  const expenseMonthIndex = availableExpenseMonths.indexOf(month);
  const expenses = current
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s - Math.abs(t.amount), 0);
  const income = current
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const balance = viewTxs.reduce((s, t) => s + t.amount, 0);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5 + i);
    const key = d.toISOString().slice(0, 7);
    const rows = viewTxs.filter((t) => t.date.startsWith(key));
    return {
      key,
      label: new Intl.DateTimeFormat("it-IT", { month: "short" }).format(d),
      value: rows.reduce((s, t) => s + t.amount, 0),
    };
  });
  const maxBar = Math.max(1, ...monthly.map((m) => Math.abs(m.value)));
  const post = async (body: any) => {
    const r = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  };
  const syncBank = async () => {
    if (!selectedAccount || !bankLinks[selectedAccount.id] || syncingBank) return;
    setSyncingBank(true); setMessage("");
    const today = new Date().toISOString().slice(0, 10);
    if (period.start > today) { setSyncingBank(false); setMessage("Il periodo selezionato non è ancora iniziato."); return; }
    const response = await fetch(`/api/open-banking/accounts/${selectedAccount.id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom: period.start, dateTo: period.end < today ? period.end : today }) });
    const result = await response.json(); setSyncingBank(false);
    if (!response.ok) return setMessage(result.error || "Sincronizzazione non riuscita");
    setBankImport({ accountId: selectedAccount.id, rows: result.rows || [], balance: result.balance || null });
    setImportOpen(true);
  };
  const changeTransactionCategory = async (transaction: Tx, category: string) => {
    if (category === transaction.category || savingCategoryIds.has(transaction.id)) return;
    const affected = (item: Tx) => item.id === transaction.id || (transaction.amount < 0 && item.amount < 0 && sameTransactionDescription(item, transaction));
    const previousCategories = new Map(txs.filter(affected).map((item) => [item.id, item.category]));
    setSavingCategoryIds((current) => new Set(current).add(transaction.id));
    setTxs((current) => current.map((item) => affected(item) ? { ...item, category } : item));
    const result = await post({ action: "transaction-category-update", id: transaction.id, category });
    if (result.error) {
      setTxs((current) => current.map((item) => previousCategories.has(item.id) ? { ...item, category: previousCategories.get(item.id)! } : item));
      setMessage(result.error);
    } else if (Array.isArray(result.updatedIds)) {
      const updatedIds = new Set<number>(result.updatedIds);
      setTxs((current) => current.map((item) => updatedIds.has(item.id) ? { ...item, category } : item));
    }
    setSavingCategoryIds((current) => { const next = new Set(current); next.delete(transaction.id); return next; });
  };
  const deleteTransaction = async (transaction: Tx) => {
    if (!confirm(`Eliminare il movimento “${transaction.description}” del ${new Date(`${transaction.date}T12:00:00`).toLocaleDateString("it-IT")}?`)) return;
    setDeletingTransactionIds((current) => new Set(current).add(transaction.id));
    const response = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: transaction.id }) });
    const result = await response.json();
    if (!response.ok || result.error) {
      setMessage(result.error || "Impossibile eliminare il movimento");
    } else {
      setTxs((current) => current.filter((item) => item.id !== transaction.id));
      setFixedExpenses((current) => current.map((expense) => ({ ...expense, payments: expense.payments.filter((payment) => payment.transactionId !== transaction.id) })));
      if (editingTx?.id === transaction.id) setEditingTx(null);
      setMessage("Movimento eliminato.");
    }
    setDeletingTransactionIds((current) => { const next = new Set(current); next.delete(transaction.id); return next; });
  };
  const toggleTransactionSpread = async (transaction: Tx, enabled: boolean) => {
    if (savingSpreadIds.has(transaction.id)) return;
    setSavingSpreadIds((current) => new Set(current).add(transaction.id));
    setTxs((current) => current.map((item) => item.id === transaction.id ? { ...item, spreadAcrossWeeks: enabled } : item));
    const result = await post({ action: "transaction-spread-update", id: transaction.id, enabled });
    if (result.error) {
      setTxs((current) => current.map((item) => item.id === transaction.id ? { ...item, spreadAcrossWeeks: transaction.spreadAcrossWeeks } : item));
      setMessage(result.error);
    }
    setSavingSpreadIds((current) => { const next = new Set(current); next.delete(transaction.id); return next; });
  };
  const openDashboardTab = (tab: "movimenti") => {
    setDashboardTab(tab);
    setMobileMenuOpen(false);
    window.history.replaceState(null, "", `#${tab}`);
    requestAnimationFrame(() => {
      document.getElementById(tab)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <main className="app-shell">
      <div className="mobile-topbar">
        <div className="brand">
          <span className="brand-mark"><WalletCards size={21} /></span>
          <span>Conti in Chiaro</span>
        </div>
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label="Apri menu"
          aria-controls="main-navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu size={22} />
        </button>
      </div>
      <aside
        id="main-navigation"
        className={`sidebar${mobileMenuOpen ? " mobile-open" : ""}`}
        aria-label="Navigazione principale"
      >
        <div className="brand">
          <span className="brand-mark">
            <WalletCards size={21} />
          </span>
          <span>Conti in Chiaro</span>
        </div>
        <button
          type="button"
          className="mobile-menu-close"
          aria-label="Chiudi menu"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X size={22} />
        </button>
        <nav>
          <a className="active" href="/" onClick={() => { setAccountFilter(configuredHomeAccount.current); setMobileMenuOpen(false); }}>Panoramica</a>
          <a href="#movimenti" onClick={(event) => { event.preventDefault(); openDashboardTab("movimenti"); }}>Movimenti</a>
          <a href="/configurazione" onClick={() => setMobileMenuOpen(false)}>
            <Settings size={15} /> Configurazione
          </a>
        </nav>
        <div className="privacy-note">
          <div className="privacy-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">{locale === "en" ? "Terms" : "Termini"}</a>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="logout-button">
              <LogOut size={13} /> Esci
            </button>
          </form>
        </div>
      </aside>
      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Chiudi menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">IL TUO QUADRO FINANZIARIO</p>
            <h1>{locale === "en" ? "Hello" : "Ciao"}, {displayName.split(" ")[0]}</h1>
          </div>
          <div className="header-actions">
            <select
              className="account-filter"
              aria-label="Filtra per conto"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="all">Tutti i conti</option>
              {accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {selectedAccount ? <div className="month-navigation" aria-label="Periodo visualizzato">
              <button type="button" onClick={() => moveMonth(-1)} disabled={selectedAccount.type === "spese_mese" && expenseMonthIndex <= 0} aria-label="Mese precedente"><ChevronLeft size={17}/></button>
              <label><span>{monthName.format(new Date(month + "-01T12:00:00"))}</span><small>{formatPeriod(period, locale)}</small>{selectedAccount.type === "spese_mese" ? <select aria-label="Scegli periodo" value={month} onChange={(event) => setMonth(event.target.value)}>{availableExpenseMonths.map((availableMonth) => <option value={availableMonth} key={availableMonth}>{monthName.format(new Date(`${availableMonth}-01T12:00:00`))}</option>)}</select> : <input aria-label="Scegli mese" type="month" max={latestDashboardMonth} value={month} onChange={(e) => setMonth(e.target.value > latestDashboardMonth ? latestDashboardMonth : e.target.value)}/>}</label>
              <button type="button" onClick={() => moveMonth(1)} disabled={selectedAccount.type === "spese_mese" ? expenseMonthIndex < 0 || expenseMonthIndex >= availableExpenseMonths.length - 1 : month >= latestDashboardMonth} aria-label="Mese successivo"><ChevronRight size={17}/></button>
            </div> : <input aria-label="Mese" type="month" max={latestDashboardMonth} value={month} onChange={(e) => setMonth(e.target.value > latestDashboardMonth ? latestDashboardMonth : e.target.value)}/>} 
            {selectedAccount && <a className="header-account-settings" href={`/configurazione/conti/${selectedAccount.id}`}><Settings size={16}/> Impostazioni conto</a>}
            {selectedAccount && bankLinks[selectedAccount.id] && <Button className="mobile-primary-action bank-sync-action" variant="outline" disabled={syncingBank} onClick={syncBank} title={`Sincronizza da ${bankLinks[selectedAccount.id]}`}><RefreshCw size={17}/><span>{syncingBank ? "Sincronizzazione…" : "Sincronizza con Enable Banking"}</span></Button>}
            <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setBankImport(null); }}>
              <DialogTrigger className="mobile-quick-action import-action" onClick={() => { setMobileMenuOpen(false); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }} render={<Button variant="outline" />}>
                <Upload size={17} /> <span>Importa estratto</span>
              </DialogTrigger>
              <DialogContent className="import-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); const dialog = event.currentTarget; requestAnimationFrame(() => dialog.focus()); }}>
                <ImportForm
                  key={`${accountFilter}-${importOpen}-${bankImport ? "bank" : "file"}`}
                  accounts={accounts}
                  defaultAccountId={bankImport ? String(bankImport.accountId) : accountFilter === "all" ? "" : accountFilter}
                  categories={categories}
                  fixedExpenses={fixedExpenses}
                  history={txs}
                  post={post}
                  initialRows={bankImport?.rows}
                  source={bankImport ? "enable_banking" : "import"}
                  lockedAccount={!!bankImport}
                  reject={() => { setBankImport(null); setImportOpen(false); }}
                  done={async (m) => {
                    setMessage(m);
                    setImportOpen(false);
                    setBankImport(null);
                    await load();
                  }}
                />
              </DialogContent>
            </Dialog>
            <Dialog open={txOpen} onOpenChange={setTxOpen}>
              <DialogTrigger className="mobile-quick-action movement-action" render={<Button variant="outline" />}>
                <Plus size={18} /> <span>Movimento</span>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuovo movimento</DialogTitle>
                </DialogHeader>
                <TxForm
                  key={`${accountFilter}-${txOpen}`}
                  accounts={accounts}
                  defaultAccountId={accountFilter === "all" ? "" : accountFilter}
                  categories={categories}
                  fixedExpenses={fixedExpenses}
                  history={txs}
                  post={post}
                  done={async () => {
                    setTxOpen(false);
                    await load();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </header>
        {message && (
          <div className="notice">
            {message}
            <button onClick={() => setMessage("")} aria-label="Chiudi">
              <X size={15} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty">Caricamento del tuo quadro…</div>
        ) : (
          <>
            {accountFilter === "all" ? <>
            <section className="metric-grid">
              <article className="metric hero-metric">
                <span>
                  {accountFilter === "all"
                    ? "Patrimonio totale"
                    : "Saldo del conto"}
                </span>
                <strong>{eur.format(balance)}</strong>
                <small>
                  {accountFilter === "all"
                    ? locale === "en"
                      ? `across ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
                      : `su ${accounts.length} ${accounts.length === 1 ? "conto" : "conti"}`
                    : viewAccounts[0]?.name}
                </small>
              </article>
              <article className="metric">
                <span>
                  <ArrowDownRight size={16} /> Uscite del mese
                </span>
                <strong>{eur.format(expenses)}</strong>
                <small>
                  {current.filter((t) => t.amount < 0).length} movimenti
                </small>
              </article>
              <article className="metric">
                <span>
                  <ArrowUpRight size={16} /> Entrate del mese
                </span>
                <strong>{eur.format(income)}</strong>
                <small>Saldo mese {eur.format(income - expenses)}</small>
              </article>
            </section>
            <section className="analysis-grid">
              <article className="panel">
                <div className="panel-title">
                  <div>
                    <p>Andamento</p>
                    <h2>Ultimi sei mesi</h2>
                  </div>
                  <span
                    className={income - expenses >= 0 ? "positive" : "negative"}
                  >
                    {eur.format(income - expenses)}
                  </span>
                </div>
                <div className="bars">
                  {monthly.map((m) => (
                    <div className="bar-col" key={m.key}>
                      <div className="bar-track">
                        <div
                          className={
                            m.value >= 0 ? "bar positive-bg" : "bar negative-bg"
                          }
                          style={{
                            height: `${Math.max(8, (Math.abs(m.value) / maxBar) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>{m.label}</small>
                    </div>
                  ))}
                </div>
              </article>
              <article className="panel">
                <div className="panel-title">
                  <div>
                    <p>Dove vanno i tuoi soldi</p>
                    <h2>Spese per categoria</h2>
                  </div>
                </div>
                <CategorySpending transactions={current} categories={categories}/>
              </article>
            </section>
            </> : viewAccounts[0] ? (
              <AccountTypeOverview
                account={viewAccounts[0]}
                transactions={viewTxs}
                month={month}
                post={post}
                reload={load}
                fixedExpenses={fixedExpenses}
                categories={categories}
              />
            ) : null}
            <Tabs
              value={dashboardTab}
              onValueChange={(value) => {
                if (value === "movimenti") {
                  setDashboardTab(value);
                  window.history.replaceState(null, "", `#${value}`);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="movimenti">Movimenti recenti</TabsTrigger>
              </TabsList>
              <TabsContent value="movimenti" id="movimenti">
                <article className="panel table-panel" ref={transactionsPanelRef}>
                  <div className="transaction-search"><Search size={16}/><input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder={isMobile ? "Cerca movimenti…" : "Cerca per descrizione, categoria, conto o importo…"} aria-label="Cerca nei movimenti del periodo"/>{transactionSearch && <button type="button" onClick={() => setTransactionSearch("")} aria-label="Cancella ricerca"><X size={15}/></button>}</div>
                  {visibleTransactions.length ? (
                    <Table key={`${compactSearchText(transactionSearch)}-${visibleTransactions.length}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="transaction-date-cell">Data</TableHead>
                          <TableHead className="transaction-description-cell">Descrizione</TableHead>
                          {accountFilter === "all" && <TableHead>Conto</TableHead>}
                          <TableHead className="transaction-category-cell">Categoria</TableHead>
                          <TableHead className="right transaction-amount-cell">Importo</TableHead>
                          <TableHead>Azioni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleTransactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell data-label="Data" className="transaction-date-cell">
                              <span className="desktop-transaction-date">{new Date(
                                t.date + "T12:00:00",
                              ).toLocaleDateString("it-IT")}</span>
                              <span className="mobile-transaction-date">{new Date(t.date + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
                            </TableCell>
                            <TableCell data-label="Descrizione" className="transaction-description-cell">
                              <TransactionDescription description={t.description} details={t.details} compactOnMobile/>
                              {(t.source === "import" || t.source === "enable_banking" || t.fixedExpenseId || (t.amount < 0 && accounts.find((account) => account.id === t.accountId)?.type === "spese_mese")) && (
                                <div className="transaction-meta">
                                  {t.source === "import" && <small className="tag">Importato</small>}
                                  {t.source === "enable_banking" && <small className="tag">Enable Banking</small>}
                                  {t.fixedExpenseId && (
                                    <small className="tag fixed-expense-tag" title={fixedExpenses.find((expense) => expense.id === t.fixedExpenseId)?.name || "Spesa fissa"}>Spesa fissa</small>
                                  )}
                                  {t.amount < 0 && accounts.find((account) => account.id === t.accountId)?.type === "spese_mese" && <label className="spread-expense-toggle"><input type="checkbox" checked={t.spreadAcrossWeeks === true} disabled={savingSpreadIds.has(t.id)} onChange={(event) => toggleTransactionSpread(t, event.target.checked)}/><span>Spalma la spesa</span></label>}
                                </div>
                              )}
                            </TableCell>
                            {accountFilter === "all" && <TableCell data-label="Conto">
                              {accounts.find((a) => a.id === t.accountId)?.name}
                            </TableCell>}
                            <TableCell data-label="Categoria" className="transaction-category-cell">
                              <select className="inline-category-select" value={t.category} disabled={savingCategoryIds.has(t.id)} onChange={(event) => changeTransactionCategory(t, event.target.value)} aria-label={`Categoria di ${t.description}`}>
                                {categories.map((category) => <option data-no-translate value={category.name} key={category.id}>{translateDefaultCategory(category.name, locale)}</option>)}
                              </select>
                            </TableCell>
                            <TableCell
                              data-label="Importo"
                              className={`right amount transaction-amount-cell ${t.amount >= 0 ? "positive" : ""}`}
                            >
                              {t.amount >= 0 ? "+" : ""}
                              {eur.format(t.amount)}
                            </TableCell>
                            <TableCell data-label="Azioni">
                              <div className="transaction-row-actions"><button type="button" className="edit-tx" onClick={() => setEditingTx({ ...t })} aria-label={`Modifica ${t.description}`} title="Modifica movimento"><Pencil size={14} /></button><button type="button" className="delete-transaction" disabled={deletingTransactionIds.has(t.id)} onClick={() => deleteTransaction(t)} aria-label={`Elimina ${t.description}`} title="Elimina movimento"><Trash2 size={14}/></button></div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : current.length ? <div className="empty">Nessun movimento corrisponde alla ricerca.</div> : (
                    <div className="empty">
                      Nessun movimento nel periodo {formatPeriod(period, locale)}.
                      Aggiungine uno o importa l’estratto conto.
                    </div>
                  )}
                </article>
              </TabsContent>
            </Tabs>
          </>
        )}
        <Dialog
          open={!!editingTx}
          onOpenChange={(v) => !v && setEditingTx(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica movimento</DialogTitle>
            </DialogHeader>
            {editingTx && (
              <TxForm
                initial={editingTx}
                accounts={accounts}
                categories={categories}
                fixedExpenses={fixedExpenses}
                history={txs}
                post={post}
                done={async () => {
                  setEditingTx(null);
                  setMessage("Movimento aggiornato");
                  await load();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </section>
    </main>
  );
}

function Field({ label, ...props }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function TxForm({
  initial,
  accounts,
  defaultAccountId = "",
  categories,
  fixedExpenses = [],
  history = [],
  post,
  done,
}: any) {
  const { locale } = useLocale();
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [f, setF] = useState({
      accountId: initial ? String(initial.accountId) : defaultAccountId,
      date: initial?.date || new Date().toISOString().slice(0, 10),
      description: initial?.description || "",
      details: initial?.details || "",
      amount: initial ? String(initial.amount) : "",
      category: initial?.category || "Altro",
      fixedExpenseId: initial?.fixedExpenseId ? String(initial.fixedExpenseId) : "",
    }),
    [error, setError] = useState("");
  const fixedExpenseOptions = initial && Number(f.amount) < 0
    ? fixedExpenses.filter((expense: FixedExpense) => {
        const month = accountCycleMonth(f.date, accounts.find((account: Account) => String(account.id) === f.accountId)?.type || "personale");
        const isCurrent = String(expense.id) === String(f.fixedExpenseId);
        const paidByAnotherMovement = expense.payments.some((payment) => payment.month === month && payment.transactionId !== initial.id);
        return expense.accountId === Number(f.accountId) && (isCurrent || (expense.active !== false && !paidByAnotherMovement && !expense.skippedMonths?.includes(month)));
      })
    : [];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fixedMatch = !initial ? matchingFixedExpense(fixedExpenses, Number(f.accountId), accounts.find((account: Account) => String(account.id) === f.accountId)?.type || "personale", f.date, transactionText(f), Number(f.amount)) : undefined;
        const fixedExpenseId = initial
          ? (f.fixedExpenseId ? Number(f.fixedExpenseId) : undefined)
          : fixedMatch && confirm(`Questo movimento sembra corrispondere alla spesa fissa “${fixedMatch.name}” da ${eur.format(fixedMatch.amount)}. Confermi?`)
            ? fixedMatch.id
            : undefined;
        const r = await post({
          action: initial ? "transaction-update" : "transaction",
          id: initial?.id,
          ...f,
          accountId: Number(f.accountId),
          amount: Number(f.amount),
          fixedExpenseId,
        });
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.duplicate === true && !initial) {
          const confirmed = confirm("Esiste un movimento simile nello stesso giorno e con lo stesso importo. Vuoi inserirlo comunque?");
          if (!confirmed) return;
          const forced = await post({ action: "transaction", ...f, accountId: Number(f.accountId), amount: Number(f.amount), fixedExpenseId, force: true });
          if (forced.error) { setError(forced.error); return; }
        }
        done();
      }}
      className="form"
    >
      <label className="field">
        <span>Conto</span>
        <Select
          value={f.accountId}
          onValueChange={(v) => {
            const accountId = v as string;
            const category = Number(f.amount) > 0 && f.category !== "Rimborso"
              ? incomeCategoryForAccount(accountId, accounts)
              : f.category;
            setF({ ...f, accountId, category });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={locale === "en" ? "Select" : "Seleziona"} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a: Account) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <Field
        label="Data"
        type="date"
        value={f.date}
        onChange={(e: any) => setF({ ...f, date: e.target.value })}
      />
      <Field
        label="Descrizione"
        required
        value={f.description}
        onChange={(e: any) => {
          const description = e.target.value;
          const amount = Number(f.amount);
          const text = transactionText({ description, details: f.details });
          const automatic = refundCategory(text, amount, history) || (amount > 0
            ? incomeCategoryForAccount(f.accountId, accounts)
            : keywordCategory(text, localCategories) || learnedCategory(text, amount, history));
          setF({ ...f, description, category: automatic || f.category });
        }}
      />
      <Field
        label="Dettaglio (facoltativo)"
        value={f.details}
        onChange={(e: any) => {
          const details = e.target.value;
          const amount = Number(f.amount);
          const text = transactionText({ description: f.description, details });
          const automatic = refundCategory(text, amount, history) || (amount > 0
            ? incomeCategoryForAccount(f.accountId, accounts)
            : keywordCategory(text, localCategories) || learnedCategory(text, amount, history));
          setF({ ...f, details, category: automatic || f.category });
        }}
      />
      <Field
        label="Importo (negativo per una spesa)"
        required
        type="number"
        step="0.01"
        value={f.amount}
        onChange={(e: any) => {
          const amount = e.target.value;
          const numericAmount = Number(amount);
          const text = transactionText(f);
          const automatic = refundCategory(text, numericAmount, history) || (numericAmount > 0
            ? incomeCategoryForAccount(f.accountId, accounts)
            : keywordCategory(text, localCategories) || learnedCategory(text, numericAmount, history));
          setF({ ...f, amount, category: automatic || f.category });
        }}
      />
      <label className="field">
        <span>Categoria</span>
        <select
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
        >
          {localCategories.map((c: Category) => (
            <option data-no-translate value={c.name} key={c.id}>{translateDefaultCategory(c.name, locale)}</option>
          ))}
        </select>
        <button type="button" className="new-category-inline" onClick={async()=>{const name=prompt("Nome della nuova categoria");if(!name?.trim())return;const r=await post({action:"category",name:name.trim(),color:"#4e8d7c"});if(r.error){setError(r.error);return}setLocalCategories([...localCategories,r.row]);setF({...f,category:r.row.name})}}>
          <Plus size={13}/> Nuova categoria
        </button>
      </label>
      {initial && Number(f.amount) < 0 && <label className="field">
        <span>Spesa fissa del mese</span>
        <select value={f.fixedExpenseId} onChange={(e) => setF({ ...f, fixedExpenseId: e.target.value })}>
          <option value="">Nessuna spesa fissa</option>
          {fixedExpenseOptions.map((expense: FixedExpense) => <option key={expense.id} value={expense.id}>{expense.name} · {eur.format(expense.amount)}</option>)}
        </select>
        <small>Mostra solo le spese ancora da pagare per questo conto e mese.</small>
      </label>}
      {error && <p className="error">{error}</p>}
      <Button disabled={!f.accountId}>
        {initial ? "Salva modifiche" : "Salva movimento"}
      </Button>
    </form>
  );
}
function AccountTypeOverview({
  account,
  transactions,
  month,
  post,
  reload,
  fixedExpenses,
  categories,
}: {
  account: Account;
  transactions: Tx[];
  month: string;
  post: (body: any) => Promise<any>;
  reload: () => Promise<void>;
  fixedExpenses: FixedExpense[];
  categories: Category[];
}) {
  if (account.type === "spese_mese") {
    return <MonthlyExpenseOverview account={account} transactions={transactions} month={month} fixedExpenses={fixedExpenses} categories={categories}/>;
  }
  if (account.type === "risparmi") {
    return <SavingsOverview account={account} transactions={transactions} month={month} post={post} reload={reload} />;
  }
  return <PersonalOverview account={account} transactions={transactions} month={month} fixedExpenses={fixedExpenses} categories={categories}/>;
}

function CategorySpendingPanel({ transactions, categories }: { transactions: Tx[]; categories: Category[] }) {
  return <section className="analysis-grid single-analysis category-spending-section"><article className="panel"><div className="panel-title"><div><p>Dove vanno i tuoi soldi</p><h2>Spese per categoria</h2></div></div><CategorySpending transactions={transactions} categories={categories}/></article></section>;
}

function CategorySpending({ transactions, categories }: { transactions: Tx[]; categories: Category[] }) {
  const { locale } = useLocale();
  const knownColors = new Map(categories.map((category) => [category.name, category.color]));
  const totals = new Map<string, number>();
  transactions.filter((transaction) => transaction.amount < 0).forEach((transaction) => totals.set(transaction.category, (totals.get(transaction.category) || 0) + Math.abs(transaction.amount)));
  const data = Array.from(totals, ([name, value]) => ({ name, value, color: knownColors.get(name) || "#7b837e" })).sort((left, right) => right.value - left.value);
  if (!data.length) return <p className="muted">Nessuna spesa nel periodo selezionato.</p>;
  return <div className="category-spending-scroll" tabIndex={0} aria-label="Spese per categoria, scorri verticalmente per vederle tutte">{data.map((category) => <div className="category category-spending-card" key={category.name}><span data-no-translate><i style={{ background: category.color }}/>{translateDefaultCategory(category.name, locale)}</span><b>{eur.format(category.value)}</b><div><em style={{ width: `${(category.value / data[0].value) * 100}%`, background: category.color }}/></div></div>)}</div>;
}

function MonthlyExpenseOverview({ account, transactions, month, fixedExpenses, categories }: { account: Account; transactions: Tx[]; month: string; fixedExpenses: FixedExpense[]; categories: Category[] }) {
  const { locale } = useLocale();
  const selectedPeriod = dashboardPeriod(month, account);
  const today = new Date().toISOString().slice(0, 10);
  const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
  const reserved = isCurrentPeriod ? unpaidFixedTotal(fixedExpenses, account.id, month) : 0;
  const data = useMemo(() => calculateWeeks(transactions, month, reserved), [transactions, month, reserved]);
  const currentWeek = data.weeks.find((week) => week.current);
  return <>
    <section className="weekly-summary weekly-summary-four compact-weekly-summary">
      {isCurrentPeriod ? <>
        <article className="current-week-balance"><span>Saldo settimana corrente</span><strong>{eur.format(currentWeek?.remaining ?? 0)}</strong><small>Resta per la settimana{currentWeek ? ` · ${currentWeek.label}` : ""}</small></article>
        <article><span>Saldo attuale sul conto</span><strong>{eur.format(data.closing)}</strong><small>{locale === "en" ? `${eur.format(data.opening)} opening balance + ${eur.format(data.income)} income − ${eur.format(data.spent)} outgoings` : `${eur.format(data.opening)} iniziali + ${eur.format(data.income)} entrate − ${eur.format(data.spent)} uscite`}</small></article>
        <article><span>Saldo previsto sul conto</span><strong>{eur.format(data.remaining)}</strong><small>Considerando {eur.format(reserved)} di spese fisse non pagate</small></article>
        <article><span>Disponibile nel periodo</span><strong>{eur.format(data.pool)}</strong><small>Dal primo venerdì al giovedì finale</small></article>
        <article><span>Speso fino ad ora</span><strong>{eur.format(data.spent)}</strong><small>{data.count} movimenti di spesa</small></article>
      </> : <>
        <article className="accent"><span>Saldo del periodo</span><strong>{eur.format(data.closing)}</strong><small>{eur.format(data.opening)} residui + {eur.format(data.income)} entrate − {eur.format(data.spent)} uscite</small></article>
        <article><span>Entrate del periodo</span><strong>{eur.format(data.opening + data.income)}</strong><small>{eur.format(data.income)} entrate + {eur.format(data.opening)} rimasti dal periodo precedente</small></article>
        <article><span>Uscite del periodo</span><strong>{eur.format(data.spent)}</strong><small>{data.count} movimenti di spesa</small></article>
        <article><span>Movimenti del periodo</span><strong>{data.transactionCount}</strong><small>Solo dal {formatPeriod(selectedPeriod, locale)}</small></article>
      </>}
    </section>
    <section className="weeks-grid home-weeks-grid">
      {data.weeks.map((week) => <article className={`week-card ${week.current ? "current" : ""}`} key={week.start}>
        <div className="week-top"><div><small>SETTIMANA {week.index + 1}</small><h2>{week.label}</h2></div>{week.current && <b>In corso</b>}</div>
        <div className="week-numbers">
          <span><small>Disponibile</small><strong>{eur.format(week.available)}</strong></span>
          <span><small>Speso</small><strong className={week.spent > week.available ? "negative" : ""}>{eur.format(week.spent)}</strong></span>
        </div>
        <div className="week-remaining"><span>Resta per la settimana</span><strong className={week.remaining < 0 ? "negative" : "positive"}>{eur.format(week.remaining)}</strong></div>
        <Progress value={Math.min(100, week.available > 0 ? 100 * week.spent / week.available : 0)} />
        <footer><span>{week.carry > 0
          ? `${eur.format(week.carry)} ricevuti dalla precedente`
          : week.carry < 0
            ? `${eur.format(Math.abs(week.carry))} sottratti per eccesso precedente`
            : "Quota settimanale"}</span><b>{Math.round(week.available > 0 ? 100 * week.spent / week.available : 0)}%</b></footer>
      </article>)}
    </section>
    <CategorySpendingPanel transactions={transactions.filter((transaction) => transaction.date >= selectedPeriod.start && transaction.date <= selectedPeriod.end)} categories={categories}/>
  </>;
}

function PersonalOverview({ account, transactions, month, fixedExpenses, categories }: { account: Account; transactions: Tx[]; month: string; fixedExpenses: FixedExpense[]; categories: Category[] }) {
  const { locale } = useLocale();
  const months = useMemo(() => closingBalances(transactions, 7, month, account), [transactions, month, account]);
  const selectedPeriod = dashboardPeriod(month, account);
  const today = new Date().toISOString().slice(0, 10);
  const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
  const savingLabel = isCurrentPeriod ? "Previsione risparmi" : "Risparmio del mese";
  const current = months.at(-1)?.balance ?? 0;
  const previous = months.at(-2)?.balance ?? current;
  const reserved = isCurrentPeriod ? unpaidFixedTotal(fixedExpenses, account.id, month) : 0;
  const savingDelta = current - previous - reserved;
  return <>
    <section className="metric-grid personal-metric-grid">
      <article className="metric"><span>Saldo reale attuale</span><strong>{eur.format(current)}</strong><small>{locale === "en" ? "Before deducting fixed expenses still due" : "Senza sottrarre le spese fisse da pagare"}</small></article>
      <article className="metric hero-metric"><span>Effettivamente spendibile</span><strong>{eur.format(current - reserved)}</strong><small>{eur.format(reserved)} riservati per spese fisse</small></article>
      <article className="metric"><span>{savingLabel}</span><strong className={savingDelta >= 0 ? "positive" : "negative"}>{eur.format(savingDelta)}</strong><small>{isCurrentPeriod ? (locale === "en" ? `Forecast change after deducting ${eur.format(reserved)} still due` : `Delta previsto, al netto di ${eur.format(reserved)} ancora da pagare`) : (locale === "en" ? "Change from the previous month's balance" : "Delta rispetto al saldo del mese precedente")}</small></article>
      <article className="metric"><span>Media risparmio mensile</span><strong>{eur.format(months.slice(1).reduce((sum, item, index) => sum + item.balance - months[index].balance, 0) / Math.max(1, months.length - 1))}</strong><small>Ultimi sei intervalli mensili</small></article>
    </section>
    <section className="analysis-grid single-analysis"><article className="panel"><div className="panel-title"><div><p>Saldo residuo</p><h2>Andamento e risparmio mensile</h2></div></div><div className="balance-line-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={months} margin={{top:12,right:6,left:0,bottom:4}}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ded8cb"/><XAxis dataKey="label" tickLine={false} axisLine={false}/><YAxis tickFormatter={(value:number)=>compactEur.format(value)} tickLine={false} axisLine={false} width={66}/><Tooltip formatter={(value)=>eur.format(Number(value))} labelFormatter={(label)=>`Fine ${label}`}/><Line type="monotone" dataKey="balance" name="Saldo" stroke="#173f35" strokeWidth={3} dot={{r:4,fill:"#f7f4ec",strokeWidth:3}} activeDot={{r:6}}/></LineChart></ResponsiveContainer></div><div className="monthly-deltas">{months.slice(1).map((item,index)=>{const delta=item.balance-months[index].balance;return <span key={item.key}><small>{item.label}</small><strong className={delta>=0?"positive":"negative"}>{delta>=0?"+":""}{eur.format(delta)}</strong></span>})}</div></article></section>
    <CategorySpendingPanel transactions={transactions.filter((transaction) => transaction.date >= selectedPeriod.start && transaction.date <= selectedPeriod.end)} categories={categories}/>
  </>;
}

function SavingsOverview({ account, transactions, month, post, reload }: { account: Account; transactions: Tx[]; month: string; post: (body: any) => Promise<any>; reload: () => Promise<void> }) {
  const balance = transactions.reduce((sum, item) => sum + item.amount, 0);
  const goal = account.savingsGoal;
  const remaining = goal ? Math.max(0, goal - balance) : 0;
  const percentage = goal ? Math.max(0, Math.min(100, balance / goal * 100)) : 0;
  const months = closingBalances(transactions, 7, month);
  const saveGoal = async () => {
    const value = prompt("Obiettivo di risparmio in euro", goal ? String(goal) : "");
    if (!value) return;
    const result = await post({ action: "savings-goal", accountId: account.id, amount: Number(value) });
    if (result.error) { alert(result.error); return; }
    await reload();
  };
  return <>
    <section className="savings-hero">
      <div><p className="eyebrow">OBIETTIVO RISPARMIO</p><h2>{goal ? `${Math.round(percentage)}% raggiunto` : "Imposta il tuo traguardo"}</h2><p>{goal ? `Mancano ${eur.format(remaining)} per arrivare a ${eur.format(goal)}.` : "Dai un obiettivo a questo conto e segui i progressi nel tempo."}</p><Button onClick={saveGoal}>{goal ? "Modifica obiettivo" : "Imposta obiettivo"}</Button></div>
      <div className="savings-progress"><span>Saldo attuale</span><strong>{eur.format(balance)}</strong>{goal && <><Progress value={percentage}/><small>{eur.format(balance)} di {eur.format(goal)}</small></>}</div>
    </section>
    <section className="analysis-grid single-analysis"><article className="panel"><div className="panel-title"><div><p>Crescita del conto</p><h2>Saldo negli ultimi mesi</h2></div></div><div className="balance-line-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={months} margin={{top:12,right:6,left:0,bottom:4}}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ded8cb"/><XAxis dataKey="label" tickLine={false} axisLine={false}/><YAxis tickFormatter={(value:number)=>compactEur.format(value)} tickLine={false} axisLine={false} width={66}/><Tooltip formatter={(value)=>eur.format(Number(value))} labelFormatter={(label)=>`Fine ${label}`}/><Line type="monotone" dataKey="balance" name="Saldo" stroke="#173f35" strokeWidth={3} dot={{r:4,fill:"#f7f4ec",strokeWidth:3}} activeDot={{r:6}}/></LineChart></ResponsiveContainer></div><div className="monthly-deltas">{months.slice(1).map((item,index)=>{const delta=item.balance-months[index].balance;return <span key={item.key}><small>{item.label}</small><strong className={delta>=0?"positive":"negative"}>{delta>=0?"+":""}{eur.format(delta)}</strong></span>})}</div></article></section>
  </>;
}

function closingBalances(transactions: Tx[], count: number, endMonth = new Date().toISOString().slice(0, 7), account: Account | null = null) {
  const endDate = new Date(`${endMonth}-01T12:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(endDate);
    date.setMonth(endDate.getMonth() - count + 1 + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const end = dashboardPeriod(key, account).end;
    return { key, label: new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(date), balance: transactions.filter((item) => item.date <= end).reduce((sum, item) => sum + item.amount, 0) };
  });
}

function dashboardPeriod(month: string, account: Account | null) {
  return accountPeriodBounds(month, account?.type || "risparmi");
}

function cycleStartFriday(monthStart: Date) {
  const nextFriday = new Date(monthStart);
  nextFriday.setDate(monthStart.getDate() + ((5 - monthStart.getDay() + 7) % 7));
  const previousFriday = new Date(nextFriday);
  previousFriday.setDate(previousFriday.getDate() - 7);
  const daysBeforeMonth = Math.round((monthStart.getTime() - previousFriday.getTime()) / 86400000);
  return daysBeforeMonth <= 1 ? previousFriday : nextFriday;
}

function monthlyCycleBounds(monthStart: Date) {
  const start = cycleStartFriday(monthStart);
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 12);
  const end = cycleStartFriday(nextMonthStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

function movementCycleMonth(dateValue: string, account: Account) {
  return accountCycleMonth(dateValue, account.type);
}

function formatPeriod(period: { start: string; end: string }, locale: "it" | "en") {
  const format = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short" });
  return `${format.format(new Date(`${period.start}T12:00:00`))} – ${format.format(new Date(`${period.end}T12:00:00`))}`;
}

function calculateWeeks(transactions: Tx[], month: string, reserved = 0) {
  const monthStart = new Date(`${month}-01T12:00:00`);
  const { start: firstFriday, end: cycleEnd } = monthlyCycleBounds(monthStart);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const startKey = dateKey(firstFriday), endKey = dateKey(cycleEnd);
  const opening = transactions.filter((item) => item.date < startKey).reduce((sum, item) => sum + item.amount, 0);
  const rows = transactions.filter((item) => item.date >= startKey && item.date <= endKey);
  const incomes = rows.filter((item) => item.amount > 0);
  const income = incomes.reduce((sum, item) => sum + item.amount, 0);
  const expenses = rows.filter((item) => item.amount < 0);
  const spent = expenses.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const pool = opening + income - reserved;
  const weeks: Array<{index:number;start:string;label:string;spent:number;available:number;remaining:number;carry:number;current:boolean}> = [];
  const weekCount = Math.max(1, Math.ceil((cycleEnd.getTime() - firstFriday.getTime() + 86400000) / 604800000));
  const spreadWeeklyAmount = expenses.filter((item) => item.spreadAcrossWeeks).reduce((sum, item) => sum + Math.abs(item.amount), 0) / weekCount;
  let fundsToDistribute = opening - reserved;
  let carry = 0;
  for (let cursor = new Date(firstFriday); cursor <= cycleEnd; cursor.setDate(cursor.getDate() + 7)) {
    const start = new Date(cursor), finish = new Date(cursor); finish.setDate(finish.getDate() + 6);
    const weekStart = dateKey(start), weekEnd = dateKey(finish);
    const weekIncome = incomes.filter((item) => item.date >= weekStart && item.date <= weekEnd).reduce((sum, item) => sum + item.amount, 0);
    const weekSpent = expenses.filter((item) => !item.spreadAcrossWeeks && item.date >= weekStart && item.date <= weekEnd).reduce((sum, item) => sum + Math.abs(item.amount), 0) + spreadWeeklyAmount;
    fundsToDistribute += weekIncome;
    const weeksRemaining = weekCount - weeks.length;
    const weeklyShare = fundsToDistribute / Math.max(1, weeksRemaining);
    fundsToDistribute -= weeklyShare;
    const available = weeklyShare + carry;
    const remaining = available - weekSpent;
    const format = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
    weeks.push({ index: weeks.length, start: dateKey(start), label: `${format.format(start)} – ${format.format(finish)}`, spent: weekSpent, available, remaining, carry, current: new Date() >= start && new Date() <= new Date(finish.getFullYear(), finish.getMonth(), finish.getDate(), 23, 59) });
    carry = remaining;
  }
  return { opening, income, closing: opening + income - spent, pool, spent, count: expenses.length, transactionCount: rows.length, remaining: pool - spent, weeks };
}
function unpaidFixedTotal(expenses: FixedExpense[], accountId: number, month: string) {
  return expenses.filter((expense) => expense.active !== false && expense.accountId === accountId && !expense.payments.some((payment) => payment.month === month) && !expense.skippedMonths?.includes(month)).reduce((sum, expense) => sum + expense.amount, 0);
}
function matchingFixedExpense(expenses: FixedExpense[], accountId: number, accountType: string, date: string, description: string, amount: number, excludedIds = new Set<number>()) {
  if (!(amount < 0) || !accountId || !date) return undefined;
  const month = accountCycleMonth(date, accountType);
  return expenses
    .filter((expense) => expense.active !== false && expense.accountId === accountId && !excludedIds.has(expense.id) && !expense.payments.some((payment) => payment.month === month) && !expense.skippedMonths?.includes(month) && fixedExpenseMatches(expense.name, expense.amount, description, amount, expense.keywords))
    .sort((a, b) => fixedExpenseSimilarity(a, amount, description) - fixedExpenseSimilarity(b, amount, description))[0];
}
function fixedExpenseSimilarity(expense: FixedExpense, amount: number, description: string) {
  const difference = Math.abs(expense.amount - Math.abs(amount));
  const exactAmount = difference < 0.005;
  const compatibleText = hasFixedDescriptionMatch(expense.name, description, expense.keywords);
  if (exactAmount && compatibleText) return 0;
  if (compatibleText && difference <= 5) return 100 + difference;
  if (exactAmount) return 200;
  return Infinity;
}
function fixedExpenseMatches(name: string, expectedAmount: number, description: string, amount: number, keywords: string[] = []) {
  const difference = Math.abs(expectedAmount - Math.abs(amount));
  return difference < 0.005 || (difference <= 5 && hasFixedDescriptionMatch(name, description, keywords));
}
function fixedMatchWords(value: string) {
  return value.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2);
}
function hasFixedDescriptionMatch(name: string, description: string, keywords: string[] = []) {
  const descriptionWords = fixedMatchWords(description), compactDescription = descriptionWords.join("");
  return [name, ...keywords].some((candidate) => {
    const candidateWords = fixedMatchWords(candidate), compactCandidate = candidateWords.join("");
    return compactCandidate.length > 0 && (compactDescription.includes(compactCandidate) || compactCandidate.includes(compactDescription) ||
      candidateWords.some((word) => descriptionWords.some((descriptionWord) => descriptionWord.includes(word) || word.includes(descriptionWord))));
  });
}

function compactSearchText(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function transactionAmountSearchValues(amount: number) {
  const absoluteAmount = Math.abs(amount);
  return [
    String(absoluteAmount),
    absoluteAmount.toFixed(2),
    eur.format(absoluteAmount),
  ];
}

function ImportForm({ accounts, defaultAccountId = "", categories, fixedExpenses = [], history, post, done, reject, initialRows = [], source = "import", lockedAccount = false }: any) {
  const { locale } = useLocale();
  const [accountId, setAccountId] = useState(defaultAccountId),
    [localCategories, setLocalCategories] = useState<Category[]>(categories),
    [rows, setRows] = useState<any[]>(initialRows),
    [error, setError] = useState(""),
    [previewFilter, setPreviewFilter] = useState<"all" | "duplicates" | "new" | "updates">("all");
  useEffect(() => {
    if (!accountId || !rows.length) return;
    const incomeCategory = incomeCategoryForAccount(accountId, accounts);
    setRows((current) => current.map((row) =>
      Number(row.amount) > 0 && row.category !== "Rimborso" && row.categoryEdited !== true
        ? { ...row, category: incomeCategory }
        : row,
    ));
  }, [accountId, rows.length, accounts]);
  const previewRows = useMemo(() => {
    const existingAccountTransactions = history.filter((transaction: Tx) => String(transaction.accountId) === accountId);
    const claimedFixedExpenseIds = new Set<number>(rows.map((row) => Number(row.fixedExpenseId)).filter((id) => id > 0));
    const orderedRows = rows.map((row, index) => ({ row, index }));
    if (source === "enable_banking") orderedRows.sort((left, right) => transactionDateValue(right.row.date) - transactionDateValue(left.row.date) || left.index - right.index);
    return orderedRows.map(({ row, index }) => {
      const externalIdMatch = source === "enable_banking" && row.externalTransactionId
        ? existingAccountTransactions.find((transaction: Tx) => transaction.source === "enable_banking" && transaction.externalTransactionId === row.externalTransactionId)
        : undefined;
      const similarExistingMatch = source === "import"
        ? existingAccountTransactions.find((transaction: Tx) => {
          if (Number(transaction.amount) !== Number(row.amount)) return false;
          const days = calendarDayDistance(transaction.date, row.date);
          return days <= 2 && transactionSimilarity(transaction, row) >= (days === 0 ? 0.6 : 0.8);
        })
        : source === "enable_banking" && !externalIdMatch
          ? existingAccountTransactions.find((transaction: Tx) => {
            return transaction.date === row.date &&
              Number(transaction.amount) === Number(row.amount) &&
              transactionSimilarity(transaction, row) >= 0.6;
          })
          : undefined;
      const sameFileMatch = source === "import" ? rows.slice(0, index).find((transaction: Tx) =>
        transaction.date === row.date && Number(transaction.amount) === Number(row.amount) && transactionSimilarity(transaction, row) >= 0.6,
      ) : undefined;
      const updateMatch = externalIdMatch
        ? buildImportUpdate(externalIdMatch, row)
        : similarExistingMatch
          ? buildImportUpdate(similarExistingMatch, row, true)
          : undefined;
      const duplicate = Boolean((externalIdMatch && !updateMatch) || (similarExistingMatch && !updateMatch) || sameFileMatch);
      const selectedFixedExpenseId = Number(row.fixedExpenseId);
      const fixedMatch = selectedFixedExpenseId > 0
        ? fixedExpenses.find((expense: FixedExpense) => expense.id === selectedFixedExpenseId)
        : matchingFixedExpense(fixedExpenses, Number(accountId), accounts.find((account: Account) => String(account.id) === accountId)?.type || "personale", row.date, transactionText(row), Number(row.amount), claimedFixedExpenseIds);
      const willImport = row.exclude !== true && (updateMatch ? updateMatch.autoUpdate === true || row.confirmUpdate === true : !duplicate || row.force === true);
      return { ...row, index, duplicate, updateMatch, fixedMatch, willImport };
    });
  }, [rows, history, accountId, fixedExpenses, source]);
  const duplicateCount = previewRows.filter((row) => row.duplicate && !row.force).length;
  const importCount = previewRows.filter((row) => row.willImport).length;
  const filterCounts = {
    all: previewRows.length,
    duplicates: previewRows.filter((row) => row.duplicate).length,
    new: previewRows.filter((row) => !row.duplicate && !row.updateMatch).length,
    updates: previewRows.filter((row) => row.updateMatch).length,
  };
  const filteredPreviewRows = previewRows.filter((row) =>
    previewFilter === "all" ||
    (previewFilter === "duplicates" && row.duplicate) ||
    (previewFilter === "new" && !row.duplicate && !row.updateMatch) ||
    (previewFilter === "updates" && row.updateMatch),
  );
  const read = async (file: File) => {
    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
      const parsed = !isXlsx
        ? parseDelimited(await file.text())
        : await parseXlsx(file);
      const result = normalizeImport(parsed, localCategories, history, isXlsx ? "xlsx" : "csv");
      setRows(result.rows);
      setPreviewFilter("all");
      setError("");
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "File non leggibile");
    }
  };
  return (
    <div>
      <DialogHeader>
        <DialogTitle>{source === "enable_banking" ? "Anteprima Enable Banking" : "Anteprima importazione"}</DialogTitle>
      </DialogHeader>
      <p className="dialog-copy">
        {source === "enable_banking"
          ? "I movimenti recuperati non sono ancora stati salvati: controlla duplicati, categorie e spese fisse, poi conferma l’importazione."
          : "Il file non viene importato subito: controlla un esempio dei dati, poi scegli se accettare o rifiutare."}
      </p>
      <div className="form">
        <label className="field">
          <span>Conto di destinazione</span>
          <select
            value={accountId}
            disabled={lockedAccount}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">{locale === "en" ? "Select an account" : "Seleziona un conto"}</option>
            {accounts.map((a: Account) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {source !== "enable_banking" && <label className="drop">
          <Upload />
          <b>Scegli l’estratto conto</b>
          <span>CSV o XLSX, prima riga con intestazioni</span>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
          />
        </label>}
        {error && <p className="error">{error}</p>}
        {source === "enable_banking" && rows.length === 0 && <p className="empty">Nessun movimento disponibile nel periodo selezionato.</p>}
        {rows.length > 0 && (
          <div className="import-preview">
            <div className="preview-summary">
              <div><b>{rows.length} {locale === "en" ? (rows.length === 1 ? "transaction recognized" : "transactions recognized") : (rows.length === 1 ? "movimento riconosciuto" : "movimenti riconosciuti")}</b><small><strong>{importCount}</strong> {locale === "en" ? "to import" : "da importare"}{duplicateCount > 0 && <> · <strong>{duplicateCount}</strong> {locale === "en" ? (duplicateCount === 1 ? "duplicate excluded" : "duplicates excluded") : (duplicateCount === 1 ? "duplicato escluso" : "duplicati esclusi")}</>}</small></div>
              <Button type="button" variant="outline" onClick={async () => {
                const name = prompt("Nome della nuova categoria");
                if (!name?.trim()) return;
                const result = await post({ action: "category", name: name.trim(), color: "#4e8d7c" });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setLocalCategories((current) => [...current, result.row]);
                setError("");
              }}><Plus size={14}/> Nuova categoria</Button>
            </div>
            <div className="preview-filters" aria-label="Filtra movimenti dell'importazione">
              {([
                ["all", "Tutti"],
                ["duplicates", "Duplicati"],
                ["new", "Nuovi"],
                ["updates", "Aggiornamenti"],
              ] as const).map(([value, label]) => <button key={value} type="button" className={previewFilter === value ? "active" : ""} aria-pressed={previewFilter === value} onClick={() => setPreviewFilter(value)}>{label} <span>{filterCounts[value]}</span></button>)}
            </div>
            <div className="preview-table">
              {filteredPreviewRows.map((r) => (
                <div key={r.index} className={r.willImport ? "will-import" : "duplicate-row"}>
                  <span>{r.date}</span>
                  <TransactionDescription description={r.description} details={r.details}/>
                  <span className={r.amount >= 0 ? "positive" : "negative"}>
                    {eur.format(r.amount)}
                  </span>
                  <label className="preview-category">
                    <span className="sr-only">Categoria di {r.description}</span>
                    <select value={r.category} onChange={(event) => {
                      const category = event.target.value;
                      setRows((current) => current.map((item, index) => {
                        const sameExpense = r.amount < 0 && Number(item.amount) < 0 && sameTransactionDescription(item, r);
                        return index === r.index || sameExpense ? { ...item, category, categoryEdited: true } : item;
                      }));
                    }}>
                      {localCategories.map((category: Category) => <option data-no-translate key={category.id} value={category.name}>{translateDefaultCategory(category.name, locale)}</option>)}
                    </select>
                  </label>
                  <span className="import-status">{r.exclude ? "Escluso" : r.updateMatch?.autoUpdate ? "Sarà aggiornato con i nuovi dettagli" : r.updateMatch && !r.confirmUpdate ? "Aggiornamento disponibile" : r.willImport ? (r.confirmUpdate ? "Sarà aggiornato" : "Sarà importato") : "Duplicato"}</span>
                  {r.updateMatch && !r.updateMatch.autoUpdate && <label className="force-import"><input type="checkbox" checked={r.confirmUpdate === true} onChange={(event) => setRows((current) => current.map((item, index) => index === r.index ? { ...item, confirmUpdate: event.target.checked } : item))}/><span>Conferma aggiornamento{r.updateMatch.dateChanged && <> · Data: {r.updateMatch.transaction.date} → {r.date}</>}{r.updateMatch.amountChanged && <> · Importo: {eur.format(r.updateMatch.transaction.amount)} → {eur.format(Number(r.amount))}</>}{r.updateMatch.descriptionChanged && <> · Descrizione: {r.updateMatch.transaction.description}{r.updateMatch.transaction.details ? ` — ${r.updateMatch.transaction.details}` : ""} → {r.updateMatch.nextDescription}{r.updateMatch.nextDetails ? ` — ${r.updateMatch.nextDetails}` : ""}</>}</span></label>}
                  {r.fixedMatch && <label className="force-import"><input type="checkbox" checked={r.fixedExpenseId === r.fixedMatch.id} onChange={(event) => setRows((current) => current.map((item, index) => index === r.index ? { ...item, fixedExpenseId: event.target.checked ? r.fixedMatch.id : undefined } : item))}/><span>Conferma spesa fissa: {r.fixedMatch.name}</span></label>}
                  {r.duplicate && <label className="force-import"><input type="checkbox" checked={r.force === true} onChange={(event) => setRows((current) => current.map((item, index) => index === r.index ? { ...item, force: event.target.checked } : item))}/><span>Importa comunque</span></label>}
                  {!r.duplicate && <label className="force-import"><input type="checkbox" checked={r.exclude === true} onChange={(event) => setRows((current) => current.map((item, index) => index === r.index ? { ...item, exclude: event.target.checked } : item))}/><span>Non importare questo movimento</span></label>}
                </div>
              ))}
              {!filteredPreviewRows.length && <p className="preview-filter-empty">Nessun movimento in questo filtro.</p>}
            </div>
            <small>
              I movimenti evidenziati saranno importati. Puoi escludere quelli che non vuoi salvare; i duplicati restano esclusi salvo “Importa comunque”.
            </small>
          </div>
        )}
        <div className="import-actions">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setRows([]);
              if (source === "enable_banking") reject?.();
            }}
            disabled={!rows.length}
          >
            Rifiuta importazione
          </Button>
          <Button
            disabled={!accountId || !importCount}
            onClick={async () => {
              const r = await post({
                action: "import",
                accountId: Number(accountId),
                source,
                rows: previewRows.map((row) => ({
                  ...row,
                  updateTransactionId: row.updateMatch?.autoUpdate === true || row.confirmUpdate === true ? row.updateMatch?.transaction.id : undefined,
                  confirmUpdate: row.updateMatch?.autoUpdate === true || row.confirmUpdate === true,
                  skip: !row.willImport,
                })),
              });
              if (r.error) { setError(r.error); return; }
              done(
                `${r.inserted} movimenti aggiunti${r.reconciled ? ` · ${r.reconciled} movimenti aggiornati` : ""}${r.excluded ? ` · ${r.excluded} esclusi` : ""} · ${r.duplicates} duplicati ignorati`,
              );
            }}
          >
            Importa {importCount} {importCount === 1 ? "movimento" : "movimenti"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function normalizedDescription(description: string) {
  return description.trim().toLowerCase().replace(/^(?:pagamento|pagamennto)\b[\s\S]*?\bpresso\b[\s\u00a0]*/i, "").replace(/\s+/g, " ");
}

function transactionText(item: { description?: string | null; details?: string | null }) {
  return [item.description, item.details].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ");
}

function sameTransactionDescription(left: { description?: string | null; details?: string | null }, right: { description?: string | null; details?: string | null }) {
  const field = (value?: string | null) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return field(left.description) === field(right.description) && field(left.details) === field(right.details);
}

function transactionSimilarity(left: { description?: string | null; details?: string | null }, right: { description?: string | null; details?: string | null }) {
  const tokens = (item: { description?: string | null; details?: string | null }) => new Set(
    normalizedDescription(transactionText(item)).replace(/[^a-zà-ÿ0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 1),
  );
  const leftTokens = tokens(left), rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / Math.min(leftTokens.size, rightTokens.size);
}

function calendarDayDistance(left: string, right: string) {
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00Z`), rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? Math.abs(leftTime - rightTime) / 86400000 : Infinity;
}

function buildImportUpdate(transaction: Tx, incoming: { date: string; amount: number; description: string; details?: string | null }, preserveCore = false) {
  const incomingDescription = String(incoming.description || "").trim();
  const incomingDetails = typeof incoming.details === "string" ? incoming.details.trim() || null : null;
  const existingScore = normalizedDescription(transaction.description).length + normalizedDescription(transaction.details || "").length;
  const incomingScore = normalizedDescription(incomingDescription).length + normalizedDescription(incomingDetails || "").length;
  // A description already split into summary + details is more structured than
  // a single long bank description, even when the latter contains more chars.
  const useIncomingDescription = Boolean(
    preserveCore && transaction.details
      ? false
      : transaction.details && !incomingDetails
      ? false
      : incomingDetails
        ? incomingScore > existingScore || !transaction.details
        : incomingScore > existingScore,
  );
  const nextDescription = useIncomingDescription ? incomingDescription : transaction.description;
  const nextDetails = useIncomingDescription ? incomingDetails : transaction.details || null;
  const descriptionChanged = nextDescription !== transaction.description || nextDetails !== (transaction.details || null);
  const dateChanged = !preserveCore && transaction.date !== incoming.date;
  const amountChanged = !preserveCore && Number(transaction.amount) !== Number(incoming.amount);
  return dateChanged || amountChanged || descriptionChanged
    ? { transaction, dateChanged, amountChanged, descriptionChanged, nextDescription, nextDetails, autoUpdate: preserveCore }
    : undefined;
}

function transactionDateValue(value: unknown) {
  if (typeof value !== "string") return 0;
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function incomeCategoryForAccount(accountId: string | number, accounts: Account[]) {
  return accounts.find((account) => String(account.id) === String(accountId))?.type === "personale"
    ? "Stipendio"
    : "Ricarica";
}

function parseDelimited(text: string) {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"') {
      if (quoted && clean[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === sep && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function money(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,(?=\d{3}\b)/g, "");
  return Number(normalized.replace(/[^0-9.-]/g, ""));
}
function autoCategory(text: string, amount: number, categories: Category[]) {
  const t = text.toLowerCase();
  const keywordMatch = keywordCategory(text, categories);
  if (keywordMatch) return keywordMatch;
  if (amount > 0) {
    return categories.find((category) => category.name.toLowerCase() === "stipendio")?.name || "Stipendio";
  }
  return categories.find((category) => category.name.toLowerCase() === "altro")?.name || categories[0]?.name || "Altro";
  /* Legacy fallback rules are intentionally bypassed: category keywords are user-managed. */
  const rules: [string[], string[]][] = [
    [["stipend", "salary", "emolument", "pensione"], ["stipendio", "entrate"]],
    [
      [
        "supermerc",
        "market",
        "aliment",
        "conad",
        "coop",
        "esselunga",
        "lidl",
        "carrefour",
        "eurospin",
        "todis",
        "pam ",
        "md spa",
      ],
      ["spesa", "alimentari"],
    ],
    [
      [
        "benzina",
        "carbur",
        "eni",
        "q8",
        "tamoil",
        "autostr",
        "atac",
        "trenitalia",
        "uber",
        "telepass",
        "italo",
        "parcheggio",
      ],
      ["trasporti", "auto"],
    ],
    [["farmac", "medic", "asl", "clinica", "dentista", "veterinar", "analisi"], ["salute", "animali"]],
    [
      ["ristor", "pizzeria", "bar ", "caffe", "caffè", "deliveroo", "glovo", "just eat", "mcdonald", "burger king"],
      ["ristoranti", "ristorazione"],
    ],
    [
      ["netflix", "spotify", "cinema", "teatro", "game", "steam", "playstation", "nintendo", "disney"],
      ["svago", "intrattenimento", "abbonamenti"],
    ],
    [
      ["amazon", "zalando", "negozio", "store", "ikea", "leroy merlin", "decathlon"],
      ["shopping", "acquisti"],
    ],
    [
      ["affitto", "condominio", "luce", "gas", "acqua", "utenza", "enel", "acea", "internet", "tim ", "vodafone", "windtre", "fastweb"],
      ["casa", "utenze"],
    ],
    [["assicur", "polizza"], ["assicurazioni"]],
    [["commission", "canone", "imposta di bollo"], ["commissioni", "banca"]],
  ];
  for (const [keys, names] of rules)
    if (keys.some((k) => t.includes(k))) {
      const c = categories.find((c) =>
        names.some((n) => c.name.toLowerCase().includes(n)),
      );
      if (c) return c.name;
    }
  if (amount > 0) {
    const c = categories.find((c) => c.name.toLowerCase().includes("entr") || c.name.toLowerCase().includes("stipend"));
    if (c) return c.name;
  }
  return (
    categories.find((c) => c.name.toLowerCase() === "altro")?.name ||
    categories[0]?.name ||
    "Altro"
  );
}
function keywordCategory(text: string, categories: Category[]) {
  const normalizedText = text.trim().toLowerCase().replace(/\s+/g, " ");
  return categories.find((category) =>
    (category.keywords || []).some((keyword) => {
      const normalizedKeyword = keyword.trim().toLowerCase().replace(/\s+/g, " ");
      return normalizedKeyword.length > 0 && normalizedText.includes(normalizedKeyword);
    }),
  )?.name || "";
}
function merchantKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^a-zà-ÿ ]/g, " ")
    .replace(/\b(pos|pagamento|carta|bonifico|sepa|del|con|da|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function learnedCategory(description: string, amount: number, history: Tx[]) {
  if (!(amount < 0)) return "";
  const key = merchantKey(description);
  if (key.length < 3) return "";
  const match = history.find((t) => {
    if (t.amount >= 0) return false;
    const past = merchantKey(transactionText(t));
    return (
      past === key ||
      (past.length > 5 &&
        key.length > 5 &&
        (past.includes(key) || key.includes(past)))
    );
  });
  return match?.category || "";
}
function refundCategory(description: string, amount: number, history: Array<{ description: string; details?: string | null; amount: number }>) {
  if (!(amount > 0)) return "";
  const key = description.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.length < 3) return "";
  return history.some((transaction) =>
    transaction.amount < 0 &&
    transactionText(transaction).trim().toLowerCase().replace(/\s+/g, " ") === key &&
    Math.abs(Math.abs(transaction.amount) - amount) < 0.005
  ) ? "Rimborso" : "";
}
function normalizeImport(
  data: string[][],
  categories: Category[],
  history: Tx[] = [],
  fileType: "csv" | "xlsx" = "csv",
) {
  if (data.length < 2) throw new Error("Il file non contiene movimenti");
  const normalizeHeader = (value: unknown) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const headerIndex = data.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasDate = headers.some((header) => header === "data" || header === "date" || header.startsWith("data "));
    const hasDescription = headers.some((header) => ["descrizione", "description", "operazione"].includes(header));
    const hasAmount = headers.some((header) => ["importo", "amount", "valore", "uscite", "addebiti", "entrate", "accrediti"].some((name) => header.includes(name)));
    return hasDate && hasDescription && hasAmount;
  });
  if (headerIndex < 0) throw new Error("Non è stata trovata una riga di intestazione valida");
  const h = data[headerIndex].map(normalizeHeader);
  const find = (words: string[]) =>
    h.findIndex((x) => words.some((w) => x.includes(w)));
  const di = find(["data", "date"]),
    xi = fileType === "xlsx"
      ? ["operazione", "descrizione", "description"]
        .map((name) => h.findIndex((header) => header === name))
        .find((index) => index >= 0) ?? -1
      : ["descrizione", "description", "operazione"]
        .map((name) => h.findIndex((header) => header === name))
        .find((index) => index >= 0) ?? -1,
    detailsIndex = ["dettagli", "details"]
      .map((name) => h.findIndex((header) => header === name))
      .find((index) => index >= 0) ?? -1,
    ai = find(["importo", "amount", "valore"]),
    ui = find(["uscite", "addebiti"]),
    ei = find(["entrate", "accrediti"]);
  if (di < 0 || xi < 0 || (ai < 0 && ui < 0 && ei < 0))
    throw new Error(
      fileType === "xlsx"
        ? "Servono le colonne Data, Operazione e Importo"
        : "Servono colonne Data, Descrizione e Importo (oppure Entrate/Uscite)",
    );
  const parsedRows = data
    .slice(headerIndex + 1)
    .map((r) => {
      const raw = ai >= 0 ? r[ai] : r[ei] || "" || `-${r[ui] || ""}`,
        n = money(raw),
        date = normalizeImportDate(r[di]);
      const description = String(r[xi] || "Movimento").trim();
      const details = detailsIndex >= 0 ? String(r[detailsIndex] || "").trim() || undefined : undefined;
      return {
        date,
        description,
        details,
        amount: n,
      };
    })
    .filter(
      (r) =>
        r.date && r.description && Number.isFinite(r.amount) && r.amount !== 0,
    );
  const refundHistory = [...history, ...parsedRows];
  const rows = parsedRows.map((row) => ({
    ...row,
    category:
      refundCategory(transactionText(row), row.amount, refundHistory) ||
      (row.amount < 0 ? keywordCategory(transactionText(row), categories) : "") ||
      learnedCategory(transactionText(row), row.amount, history) ||
      autoCategory(transactionText(row), row.amount, categories),
  }));
  return { rows };
}
function normalizeImportDate(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 0 && serial < 100000) {
      const timestamp = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
      return new Date(timestamp).toISOString().slice(0, 10);
    }
  }
  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?:\D|$)/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
async function parseXlsx(file: File) {
  const b = new Uint8Array(await file.arrayBuffer()),
    files: Record<string, Uint8Array> = {};
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let endOfCentralDirectory = -1;
  for (let offset = b.length - 22; offset >= Math.max(0, b.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error("Il file Excel non contiene un archivio ZIP valido");
  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  let centralOffset = view.getUint32(endOfCentralDirectory + 16, true);
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("Indice ZIP Excel non valido");
    const method = view.getUint16(centralOffset + 10, true),
      compressedSize = view.getUint32(centralOffset + 20, true),
      nameLength = view.getUint16(centralOffset + 28, true),
      extraLength = view.getUint16(centralOffset + 30, true),
      commentLength = view.getUint16(centralOffset + 32, true),
      localOffset = view.getUint32(centralOffset + 42, true),
      name = new TextDecoder().decode(b.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Contenuto ZIP Excel non valido");
    const localNameLength = view.getUint16(localOffset + 26, true),
      localExtraLength = view.getUint16(localOffset + 28, true),
      dataOffset = localOffset + 30 + localNameLength + localExtraLength,
      raw = b.slice(dataOffset, dataOffset + compressedSize);
    if (method === 0) files[name] = raw;
    else if (method === 8) {
      const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
      files[name] = new Uint8Array(
        await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer(),
      );
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  const dec = (n: string) =>
    files[n] ? new TextDecoder().decode(files[n]) : "";
  const shared = [
    ...dec("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((x) => xml(x[1]))
      .join(""),
  );
  const sheet = dec("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Il primo foglio Excel non è leggibile");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const out: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = c[1].match(/\br="([A-Z]+)\d+"/),
        type = c[1].match(/\bt="([^"]+)"/)?.[1];
      if (!reference) continue;
      const idx = reference[1].split("").reduce((s, x) => s * 26 + x.charCodeAt(0) - 64, 0) - 1,
        v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/))?.[1] || "";
      out[idx] = type === "s" ? shared[Number(v)] || "" : xml(v);
    }
    return out;
  });
}
function xml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
