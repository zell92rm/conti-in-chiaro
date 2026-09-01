import { en } from "@/locales/en";
import { it } from "@/locales/it";

export type Locale = "it" | "en";
export const LOCALE_COOKIE = "conti_locale";
export const locales = { it, en } as const;
export type MessageKey = keyof typeof it.messages;

export function normalizeLocale(value?: string | null): Locale { return value === "en" ? "en" : "it"; }
export function message(locale: Locale, key: MessageKey): string { return locales[locale].messages[key]; }

const englishReplacements = Object.keys(it.messages)
  .map((key) => [it.messages[key as MessageKey], en.messages[key as MessageKey]] as const)
  .sort((left, right) => right[0].length - left[0].length);

export function translateItalianText(value: string, locale: Locale): string {
  if (locale === "it" || !value.trim()) return value;
  return englishReplacements.reduce((text, [source, target]) => {
    const straight = text.split(source).join(target);
    return straight.split(source.replaceAll("'", "’")).join(target);
  }, value);
}
