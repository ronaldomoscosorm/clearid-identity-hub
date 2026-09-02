import { useSyncExternalStore } from "react";

export interface ArgusEnvConfig {
  baseUrl: string;
  apiKey: string;
  defaultSiteId?: string;
  defaultSiteName?: string;
  defaultRuleId?: string;
  defaultRuleName?: string;
  /**
   * Quando true, o cadastro de visita pode vincular o visitante a uma
   * identidade (habilita foto/credencial). Opcional — off por padrão.
   */
  linkVisitorToIdentity?: boolean;
}

const CFG_KEY = "argus.config";

const DEFAULT: ArgusEnvConfig = {
  // Backend clearid. Configurável por .env (VITE_ARGUS_API_BASE_URL) para
  // alternar entre produção e um backend local sem tocar no código.
  // Um override salvo em localStorage (tela de Configurações) tem precedência.
  baseUrl:
    (import.meta.env.VITE_ARGUS_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ??
    "https://argusclearidapi.rmtecho.com.br",
  apiKey: "",
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getConfig(): ArgusEnvConfig {
  if (!isBrowser()) return DEFAULT;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ArgusEnvConfig>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

export function saveConfig(cfg: ArgusEnvConfig) {
  if (!isBrowser()) return;
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  notify();
}

// Pub/sub for useSyncExternalStore
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CFG_KEY) cb();
  };
  if (isBrowser()) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (isBrowser()) window.removeEventListener("storage", onStorage);
  };
}

export function useArgusConfig(): ArgusEnvConfig {
  const data = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getConfig()),
    () => JSON.stringify(DEFAULT),
  );
  return JSON.parse(data) as ArgusEnvConfig;
}