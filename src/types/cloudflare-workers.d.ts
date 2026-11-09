// Dichiarazioni minime dei tipi Cloudflare usati dal progetto (solo tipi, nessun effetto a runtime).
interface D1Result<T = unknown> { results: T[]; success: boolean }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
declare module "cloudflare:workers" {
  export const env: { DB: D1Database; OPEN_BANKING_ENCRYPTION_KEY?: string; ASSETS?: Fetcher };
}
