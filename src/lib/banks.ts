// Registro delle banche supportate per l'import degli estratti conto.
// Per aggiungere una banca: nuova voce qui + profilo di parsing in statement-import.
export type BankId = "intesa" | "hype" | "revolut";
export type StatementFileType = "csv" | "xlsx";

export type BankProfile = { id: BankId; label: string; fileType: StatementFileType };

export const BANKS: BankProfile[] = [
  { id: "intesa", label: "Intesa Sanpaolo", fileType: "xlsx" },
  { id: "hype", label: "Hype", fileType: "csv" },
  { id: "revolut", label: "Revolut", fileType: "csv" },
];

export function getBank(id: unknown): BankProfile | undefined {
  return BANKS.find((bank) => bank.id === id);
}
