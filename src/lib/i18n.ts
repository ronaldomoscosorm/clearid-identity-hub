import { useSyncExternalStore } from "react";
import { dictionaries } from "./i18n-dict";

export type Lang = "pt-BR" | "en-US" | "es-ES";

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "pt-BR", label: "Português", short: "PT" },
  { code: "en-US", label: "English", short: "EN" },
  { code: "es-ES", label: "Español", short: "ES" },
];

export const DEFAULT_LANG: Lang = "pt-BR";

const KEY = "argus.lang";

function isBrowser() {
  return typeof window !== "undefined";
}

function isLang(v: string | null): v is Lang {
  return v === "pt-BR" || v === "en-US" || v === "es-ES";
}

export function getLang(): Lang {
  if (!isBrowser()) return DEFAULT_LANG;
  const raw = localStorage.getItem(KEY);
  return isLang(raw) ? raw : DEFAULT_LANG;
}

export function setLang(lang: Lang) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  if (isBrowser()) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (isBrowser()) window.removeEventListener("storage", onStorage);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => DEFAULT_LANG);
}

/** Traduz `key` para `lang` (fallback: pt-BR → a própria key). Interpola {vars}. */
export function translate(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const raw =
    dictionaries[lang]?.[key] ?? dictionaries[DEFAULT_LANG]?.[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Hook principal: retorna t() vinculado ao idioma ativo, além de lang/setLang. */
export function useT(): { t: TFn; lang: Lang; setLang: (l: Lang) => void } {
  const lang = useLang();
  const t: TFn = (key, vars) => translate(key, lang, vars);
  return { t, lang, setLang };
}
