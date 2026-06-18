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
  primaryColor: "#1e3a5f",
  accentColor: "#3b6fa0",
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getBranding(): BrandingConfig {
  if (!isBrowser()) return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<BrandingConfig>) };
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
  if (cfg.primaryColor) {
    root.style.setProperty("--primary", cfg.primaryColor);
    root.style.setProperty("--sidebar-primary", cfg.primaryColor);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--sidebar-primary");
  }
  if (cfg.accentColor) {
    root.style.setProperty("--accent", cfg.accentColor);
    root.style.setProperty("--ring", cfg.accentColor);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--ring");
  }
}

export function useApplyBranding() {
  const b = useBranding();
  useEffect(() => {
    applyBranding(b);
  }, [b]);
}