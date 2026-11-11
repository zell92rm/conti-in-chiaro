// Registro dei fornitori di energia supportati per la lettura automatica delle bollette via email.
// Per aggiungere un fornitore: nuova voce qui + parser dedicato in bill-parsers.
export type EnergyProviderId = "octopus";
export type EnergySupply = "luce" | "gas";

export type EnergyProvider = {
  id: EnergyProviderId;
  label: string;
  /** Dominio del mittente delle email (ricerca IMAP FROM). */
  senderDomain: string;
  /** Testo che l'oggetto delle email di bolletta deve contenere (ricerca IMAP SUBJECT). */
  subjectContains: string;
};

export const ENERGY_PROVIDERS: EnergyProvider[] = [
  { id: "octopus", label: "Octopus Energy", senderDomain: "octopusenergy.it", subjectContains: "La tua bolletta Octopus Energy" },
];

export function getEnergyProvider(id: unknown): EnergyProvider | undefined {
  return ENERGY_PROVIDERS.find((provider) => provider.id === id);
}

export const SUPPLY_LABELS: Record<EnergySupply, string> = { luce: "Luce", gas: "Gas" };
export const isSupply = (value: unknown): value is EnergySupply => value === "luce" || value === "gas";

/** Per ora si accettano solo caselle Gmail (IMAP imap.gmail.com:993). */
export const GMAIL_IMAP = { host: "imap.gmail.com", port: 993 } as const;
export const GMAIL_ONLY_MESSAGE = "Al momento è possibile configurare solo caselle Gmail";
export function isGmailAddress(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@(gmail|googlemail)\.com$/i.test(value.trim());
}
