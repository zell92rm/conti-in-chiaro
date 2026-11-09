"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type KeywordConflict = { scope: "category" | "fixed_expense"; keyword: string; holderId: number; holderName: string; targetId: number; targetName: string };
type Choice = "keep" | "move" | "blacklist";
const EVENT = "keyword-conflicts";
const conflictKey = (item: KeywordConflict) => `${item.scope}|${item.keyword}|${item.holderId}|${item.targetId}`;

export function reportKeywordConflicts(conflicts?: KeywordConflict[]) {
  if (conflicts?.length && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: conflicts }));
}

export function KeywordConflictHost() {
  const [queue, setQueue] = useState<KeywordConflict[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (event: Event) => {
      const incoming = (event as CustomEvent<KeywordConflict[]>).detail || [];
      setQueue((current) => {
        const known = new Set(current.map(conflictKey));
        return [...current, ...incoming.filter((item) => !known.has(conflictKey(item)))];
      });
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const close = () => { setQueue([]); setChoices({}); setError(""); };
  const apply = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "keyword-conflict-resolve",
        decisions: queue.map((item) => ({ scope: item.scope, keyword: item.keyword, targetId: item.targetId, action: choices[conflictKey(item)] || "keep" })),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
      close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Operazione non riuscita"); }
    setSaving(false);
  };

  return <Dialog open={queue.length > 0} onOpenChange={(open) => { if (!open && !saving) close(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Parole chiave in conflitto</DialogTitle></DialogHeader>
      <div className="keyword-conflict">
        <p>L’apprendimento automatico ha trovato {queue.length === 1 ? "una parola" : "alcune parole"} già assegnat{queue.length === 1 ? "a" : "e"} manualmente a un’altra voce. Scegli cosa fare per ciascuna.</p>
        <ul>
          {queue.map((item) => {
            const kind = item.scope === "category" ? "categoria" : "spesa fissa";
            return <li key={conflictKey(item)}>
              <div><strong>{item.keyword}</strong><small>Manuale in {kind} “{item.holderName}”. Questo movimento usa “{item.targetName}”.</small></div>
              <select aria-label={`Cosa fare con ${item.keyword}`} value={choices[conflictKey(item)] || "keep"} onChange={(event) => setChoices((current) => ({ ...current, [conflictKey(item)]: event.target.value as Choice }))}>
                <option value="keep">Mantieni in “{item.holderName}”</option>
                <option value="move">Sposta in “{item.targetName}”</option>
                <option value="blacklist">Metti in blacklist (rimuovi da “{item.holderName}”)</option>
              </select>
            </li>;
          })}
        </ul>
        {error && <p className="error">{error}</p>}
        <div className="keyword-conflict-actions">
          <Button type="button" variant="outline" onClick={close} disabled={saving}>Decidi più tardi</Button>
          <Button type="button" onClick={apply} disabled={saving}>{saving ? "Salvataggio…" : "Applica scelte"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
