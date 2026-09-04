"use client";

import { createContext, useContext, useEffect } from "react";
import { LOCALE_COOKIE, Locale, locales, MessageKey, message, translateItalianText } from "@/lib/i18n";

const LocaleContext = createContext({ locale: "it" as Locale, setLocale: (_locale: Locale) => {}, t: (key: MessageKey) => message("it", key) });
const translatedAttributes = ["placeholder", "title", "aria-label", "alt", "data-label"];

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  useEffect(() => {
    if (locale !== "en") return;
    const translateNode = (root: Node) => {
      const element = root instanceof Element ? root : root.parentElement;
      if (element?.closest("[data-no-translate]")) return;
      if (root.nodeType === Node.TEXT_NODE && root.textContent) {
        const translated = translateItalianText(root.textContent, locale);
        if (translated !== root.textContent) root.textContent = translated;
      }
      if (root instanceof Element) {
        for (const attribute of translatedAttributes) {
          const value = root.getAttribute(attribute);
          if (value) {
            const translated = translateItalianText(value, locale);
            if (translated !== value) root.setAttribute(attribute, translated);
          }
        }
      }
      root.childNodes.forEach(translateNode);
    };
    translateNode(document.body);
    const observer = new MutationObserver((entries) => entries.forEach((entry) => {
      if (entry.type === "characterData") translateNode(entry.target);
      entry.addedNodes.forEach(translateNode);
    }));
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    const originalAlert = window.alert, originalConfirm = window.confirm, originalPrompt = window.prompt;
    window.alert = (value) => originalAlert(translateItalianText(String(value ?? ""), locale));
    window.confirm = (value) => originalConfirm(translateItalianText(String(value ?? ""), locale));
    window.prompt = (value, defaultValue) => originalPrompt(translateItalianText(String(value ?? ""), locale), defaultValue);
    return () => { observer.disconnect(); window.alert = originalAlert; window.confirm = originalConfirm; window.prompt = originalPrompt; };
  }, [locale]);
  const setLocale = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
  };
  return <LocaleContext.Provider value={{ locale, setLocale, t: (key) => message(locale, key) }}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
export const localeOptions = (["it", "en"] as Locale[]).map((code) => ({ code, name: locales[code].name, flag: locales[code].flag }));
