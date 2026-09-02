import { useEffect, useSyncExternalStore } from "react";

/**
 * Site ativo — par `cliente:site` (ex.: `corteva:LA-BR-Alphaville`).
 * Persistido em sessionStorage: sobrevive a reloads da aba, mas some quando fecha.
 *
 * Usado pelo argus-client em cada request via header `X-Argus-Site`, e pelo
 * dropdown do topbar para trocar entre sites que o usuário tem grant.
 */
const KEY = "argus.activeSite";

const listeners = new Set<() => void>();
function notify() {
  for (const cb of listeners) cb();
}

function isBrowser() {
  return typeof window !== "undefined";
}

/** Retorna o site ativo (`cliente:site`) ou `null` se nenhum foi escolhido. */
export function getActiveSite(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Define o site ativo. `null` limpa. */
export function setActiveSite(value: string | null) {
  if (!isBrowser()) return;
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
    notify();
  } catch {
    /* ignore */
  }
}

/** Hook que re-renderiza quando o site ativo muda. */
export function useActiveSite(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getActiveSite,
    () => null,
  );
}

/**
 * Ao logar, se o usuário não tem site ativo, seleciona o primeiro da lista permitida
 * automaticamente. Chame no root layout após ter `sites` do useCurrentUser.
 */
export function useEnsureActiveSite(sitesAllowed: string[] | undefined) {
  useEffect(() => {
    if (!sitesAllowed || sitesAllowed.length === 0) return;
    const current = getActiveSite();
    if (current && sitesAllowed.includes(current)) return;
    setActiveSite(sitesAllowed[0]);
  }, [sitesAllowed]);
}
