// Worker di lettura email delle bollette (gira nel container, accanto al server dell'app).
// Ogni 30 secondi chiede all'app quali configurazioni sono da eseguire, legge la casella via IMAP e invia le email
// all'app, che si occupa di interpretarle e di aggiornare gli importi. La password non viene mai scritta su disco.
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const APP_URL = new URL(process.env.MAIL_SYNC_APP_URL || "http://127.0.0.1:5173");
const TOKEN = process.env.MAIL_SYNC_TOKEN || "";
const POLL_MS = Number(process.env.MAIL_SYNC_POLL_MS || 30_000);

const log = (...args) => console.log("[mail-sync]", ...args);

/** Chiamata JSON verso l'app locale (accetta il certificato autofirmato solo per questo host locale). */
function callApp(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const transport = APP_URL.protocol === "https:" ? https : http;
    const request = transport.request({
      hostname: APP_URL.hostname, port: APP_URL.port || (APP_URL.protocol === "https:" ? 443 : 80), path, method,
      rejectUnauthorized: false,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode, json: data ? JSON.parse(data) : null }); }
        catch { reject(new Error(`Risposta non valida dall'app (${response.statusCode})`)); }
      });
    });
    request.on("error", reject);
    request.setTimeout(60_000, () => request.destroy(new Error("Timeout verso l'app")));
    if (payload) request.write(payload);
    request.end();
  });
}

function friendlyError(error) {
  const text = `${error?.response || ""} ${error?.responseText || ""} ${error?.message || ""}`;
  if (error?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|authenticat/i.test(text))
    return "Accesso a Gmail non riuscito: controlla l'email e la password per le app (serve la verifica in 2 passaggi attiva).";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(text)) return "Impossibile raggiungere Gmail: controlla la connessione di rete del server.";
  return `Lettura non riuscita: ${error?.message || "errore sconosciuto"}`;
}

async function readMailbox(job) {
  const client = new ImapFlow({ host: job.host, port: job.port, secure: true, auth: { user: job.user, pass: job.password }, logger: false });
  const mails = [];
  const seen = new Set(); // la stessa email compare in più cartelle (etichette Gmail): si scarica una volta sola
  const folderErrors = [];
  await client.connect();
  try {
    // Tutte le cartelle di Gmail, spam e cestino compresi (esclusi solo i contenitori non selezionabili, es. "[Gmail]").
    const boxes = (await client.list()).filter((box) => !box.flags?.has("\\Noselect") && !box.flags?.has("\\NonExistent"));
    // "Tutti i messaggi" per prima: contiene quasi tutto, le altre cartelle aggiungono spam e cestino.
    boxes.sort((a, b) => Number(b.specialUse === "\\All") - Number(a.specialUse === "\\All"));
    let searched = 0;
    for (const box of boxes) {
      let lock;
      try { lock = await client.getMailboxLock(box.path, { readOnly: true }); }
      catch (error) { folderErrors.push(`${box.path}: ${error?.message || "non apribile"}`); continue; }
      try {
        searched++;
        // Regole di lettura del fornitore selezionato: mittente e oggetto.
        const query = { from: job.senderDomain, subject: job.subjectContains };
        if (job.since) query.since = new Date(`${job.since}T00:00:00`);
        const uids = await client.search(query, { uid: true });
        for (const uid of uids || []) {
          const head = await client.fetchOne(String(uid), { envelope: true, internalDate: true }, { uid: true });
          const messageId = head?.envelope?.messageId;
          if (messageId && seen.has(messageId)) continue;
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message?.source) continue;
          const parsed = await simpleParser(message.source);
          const date = (parsed.date || head?.internalDate || new Date()).toISOString();
          const emailId = parsed.messageId || messageId || `sha256:${createHash("sha256").update(`${parsed.from?.text || ""}|${date}|${parsed.subject || ""}`).digest("hex")}`;
          if (seen.has(emailId)) continue;
          seen.add(emailId);
          if (messageId) seen.add(messageId);
          mails.push({ emailId, subject: parsed.subject || "", date, text: parsed.text || null, html: parsed.text ? null : (parsed.html || null) });
        }
      } catch (error) { folderErrors.push(`${box.path}: ${error?.message || "ricerca non riuscita"}`); }
      finally { lock.release(); }
    }
    if (!searched) throw new Error("Nessuna cartella leggibile nella casella");
  } finally { await client.logout().catch(() => {}); }
  if (folderErrors.length) log(`cartelle con errori: ${folderErrors.join(" | ")}`);
  return mails;
}

async function runJob(job) {
  log(`esecuzione ${job.reason}${job.mode === "full" ? " (scansione completa)" : job.since ? ` dal ${job.since}` : " (tutta la casella)"} per la configurazione ${job.configId}`);
  let result;
  try { result = { configId: job.configId, mails: await readMailbox(job) }; }
  catch (error) { log("errore:", error?.message); result = { configId: job.configId, error: friendlyError(error) }; }
  const response = await callApp("POST", "/api/internal/mail-sync/result", result);
  log(`esito inviato (${response.status})`, result.error ? "con errore" : `${result.mails.length} email`);
}

async function tick() {
  const { status, json } = await callApp("GET", "/api/internal/mail-sync/due");
  if (status === 401) { log("token non valido: il worker si ferma"); process.exit(1); }
  for (const job of json?.jobs || []) await runJob(job);
}

if (!TOKEN) { log("MAIL_SYNC_TOKEN mancante: worker non avviato"); process.exit(1); }
log(`avviato, controllo ogni ${Math.round(POLL_MS / 1000)}s su ${APP_URL.origin}`);
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try { await tick(); } catch { /* app non ancora pronta o riavvio in corso: si riprova */ }
  finally { busy = false; }
}, POLL_MS);
