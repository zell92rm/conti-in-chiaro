import { getCurrentUser } from "../../../auth";
import { enableBankingFetch } from "../../../../lib/enable-banking-client";

type RawAspsp = { name?: unknown; country?: unknown; logo?: unknown; psu_types?: unknown; auth_methods?: unknown; maximum_consent_validity?: unknown; beta?: unknown; bic?: unknown };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try {
    const response = await enableBankingFetch(user.id, "/aspsps?country=IT&service=AIS");
    if (!response.ok) {
      const upstream = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
      const code = safeCode(upstream?.error);
      const apiMessage = safeMessage(upstream?.message);
      const detail = apiMessage ? ` Dettaglio Enable Banking: ${apiMessage}` : "";
      return Response.json({ error: `Impossibile ottenere l’elenco delle banche (risposta ${response.status}).${detail}`, code, apiMessage }, { status: 502 });
    }
    const payload = await response.json() as { aspsps?: RawAspsp[] };
    const aspsps = (payload.aspsps || []).filter(item => item.name && item.country === "IT").map(item => ({
      name: String(item.name), country: "IT", logo: typeof item.logo === "string" ? item.logo : null,
      psuTypes: Array.isArray(item.psu_types) ? item.psu_types.filter(value => value === "personal" || value === "business") : [],
      authMethods: Array.isArray(item.auth_methods) ? item.auth_methods : [],
      maximumConsentValidity: Number(item.maximum_consent_validity) || 86400,
      beta: item.beta === true, bic: typeof item.bic === "string" ? item.bic : null,
    })).sort((a, b) => a.name.localeCompare(b.name, "it"));
    return Response.json({ aspsps });
  } catch (error) {
    const diagnostic = safeMessage(error instanceof Error ? error.message : null);
    const detail = diagnostic ? ` Dettaglio locale: ${diagnostic}` : "";
    return Response.json({ error: `Impossibile contattare Enable Banking.${detail}`, diagnostic }, { status: 502 });
  }
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
}

function safeMessage(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null : null;
}
