import assert from "node:assert/strict";
import test from "node:test";

const { parseOctopusBill, octopusSupplyFromSubject, htmlToLines } = await import("../src/lib/octopus-bill.ts");
const { isGmailAddress } = await import("../src/lib/energy-providers.ts");

const LUCE_SUBJECT = "INFO - ⚡️ La tua bolletta Octopus Energy - Luce";
const LUCE_TEXT = `La tua bolletta in sintesi
Periodo di riferimento: dal 01/10/2026 al 31/10/2026

------------------------

Elettricità

Consumo fatturato: 122 kWh
Totale (IVA inclusa): 48,35 €;

Metodo di pagamento: Addebito diretto SDD
Scadenza: 26/11/2026`;

// Struttura a celle come nell'HTML delle email Octopus (etichetta e valore in celle diverse).
const gasHtml = (label = "Totale da pagare") => `
<html><head><style>.x{color:red}</style></head><body>
<div>La tua bolletta in sintesi</div>
<div>Periodo di riferimento: dal 01/10/2026 al 31/10/2026</div>
<table><tr><td>Gas Naturale</td></tr>
<tr><td>Consumo fatturato</td><td align="right">23&nbsp;Smc</td></tr></table>
<table><tr><td>IVA</td><td>5,28&nbsp;&euro;<br></td></tr>
<tr><td>${label}</td><td>42,96&nbsp;&euro;<br/></td></tr></table>
<table><tr><td>&euro; <b>Metodo di pagamento</b></td><td>Addebito diretto SDD</td></tr>
<tr><td><b>Scadenza</b></td><td>30/11/2026</td></tr></table>
</body></html>`;

test("riconosce l'oggetto con altro testo prima o dopo", () => {
  assert.equal(octopusSupplyFromSubject(LUCE_SUBJECT), "luce");
  assert.equal(octopusSupplyFromSubject("Re: la tua BOLLETTA octopus energy – Gas (copia)"), "gas");
  assert.equal(octopusSupplyFromSubject("La tua bolletta Octopus Energy - Gas"), "gas");
  assert.equal(octopusSupplyFromSubject("Offerta Octopus Energy - Luce"), null);
  assert.equal(octopusSupplyFromSubject("La tua bolletta Octopus Energy - Acqua"), null);
});

test("un oggetto non pertinente viene ignorato", () => {
  assert.equal(parseOctopusBill({ subject: "Novità da Octopus", text: LUCE_TEXT }), null);
});

test("legge la bolletta della luce dal testo semplice", () => {
  assert.deepEqual(parseOctopusBill({ subject: LUCE_SUBJECT, text: LUCE_TEXT }), {
    supply: "luce", consumption: 122, consumptionUnit: "kWh", total: 48.35, dueDate: "2026-11-26",
    periodLabel: "01/10/2026 - 31/10/2026", note: null,
  });
});

test("legge la bolletta del gas dall'HTML a celle", () => {
  assert.deepEqual(parseOctopusBill({ subject: "La tua bolletta Octopus Energy - Gas", html: gasHtml() }), {
    supply: "gas", consumption: 23, consumptionUnit: "Smc", total: 42.96, dueDate: "2026-11-30",
    periodLabel: "01/10/2026 - 31/10/2026", note: null,
  });
});

test("usa l'HTML se nel testo mancano i campi", () => {
  const parsed = parseOctopusBill({ subject: "La tua bolletta Octopus Energy - Gas", text: "ciao", html: gasHtml() });
  assert.equal(parsed.total, 42.96);
  assert.equal(parsed.dueDate, "2026-11-30");
});

test("segnala i campi non riconosciuti", () => {
  const parsed = parseOctopusBill({ subject: "La tua bolletta Octopus Energy - Luce", text: "Nessun dato" });
  assert.equal(parsed.supply, "luce");
  assert.equal(parsed.total, null);
  assert.match(parsed.note, /totale/);
});

test("importi con migliaia", () => {
  const parsed = parseOctopusBill({ subject: "La tua bolletta Octopus Energy - Gas", text: "Totale (IVA inclusa): 1.234,56 €\nScadenza: 05/12/2026" });
  assert.equal(parsed.total, 1234.56);
  assert.equal(parsed.dueDate, "2026-12-05");
});

test("htmlToLines separa le celle e decodifica le entità", () => {
  assert.equal(htmlToLines("<td>A&nbsp;B</td><td>1,00&nbsp;&euro;</td>"), "A B\n1,00 €");
});

test("accetta solo indirizzi Gmail", () => {
  assert.equal(isGmailAddress("nome@gmail.com"), true);
  assert.equal(isGmailAddress(" Nome.Cognome@GMAIL.com "), true);
  assert.equal(isGmailAddress("nome@googlemail.com"), true);
  assert.equal(isGmailAddress("nome@outlook.it"), false);
  assert.equal(isGmailAddress("nome@gmail.com.evil.it"), false);
  assert.equal(isGmailAddress(""), false);
});
