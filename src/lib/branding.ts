import { useSyncExternalStore, useEffect } from "react";

export interface BrandingConfig {
  clientName: string;
  clientLogo: string; // data URL or http URL
  primaryColor: string; // hex e.g. #1e3a5f
  accentColor: string; // hex
}

const KEY = "argus.branding";

export const DEFAULT_BRANDING: BrandingConfig = {
  clientName: "",
  clientLogo: "",
  // Cor da marca R&M (Tropical Mango) — controla o destaque do console.
  primaryColor: "#FD5300",
  accentColor: "#102943",
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getBranding(): BrandingConfig {
  if (!isBrowser()) return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<BrandingConfig>;
    // Migração das cores legadas (padrão antigo, nunca escolhidas de propósito)
    // para a identidade R&M atual.
    if (parsed.primaryColor === "#1e3a5f") parsed.primaryColor = DEFAULT_BRANDING.primaryColor;
    if (parsed.accentColor === "#3b6fa0") parsed.accentColor = DEFAULT_BRANDING.accentColor;
    return { ...DEFAULT_BRANDING, ...parsed };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function saveBranding(cfg: BrandingConfig) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(cfg));
  notify();
}

export function resetBranding() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
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

export function useBranding() {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getBranding()),
    () => JSON.stringify(DEFAULT_BRANDING),
  );
  return JSON.parse(json) as BrandingConfig;
}

/** Apply brand colors as CSS variables on :root */
export function applyBranding(cfg: BrandingConfig) {
  if (!isBrowser()) return;
  const root = document.documentElement;
  // A cor da marca dirige o destaque do console (--rm-brand) e os tokens
  // shadcn correspondentes (botão primário, foco).
  const props = ["--primary", "--sidebar-primary", "--ring", "--rm-brand", "--rm-brand-ink"];
  if (cfg.primaryColor) {
    for (const p of props) root.style.setProperty(p, cfg.primaryColor);
  } else {
    for (const p of props) root.style.removeProperty(p);
  }
}

export function useApplyBranding() {
  const b = useBranding();
  useEffect(() => {
    applyBranding(b);
  }, [b]);
}