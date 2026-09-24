import { useSyncExternalStore, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/** O usuário tem configuração PRÓPRIA (salva neste navegador)? */
export function hasOwnBranding(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

// ---------- Configuração BÁSICA por cliente (tabela client_branding) ----------
// Definida pelo administrador; vale para todos os usuários do cliente que não
// tenham configuração própria. Resolução: própria → básica do cliente → padrão.

/** Lê a configuração básica do cliente (ou null se não definida). */
export async function loadClientBranding(profile: string): Promise<BrandingConfig | null> {
  if (!profile) return null;
  const { data, error } = await supabase
    .from("client_branding")
    .select("client_name, client_logo, primary_color, accent_color")
    .eq("profile", profile)
    .maybeSingle();
  if (error || !data) return null;
  return {
    clientName: data.client_name ?? "",
    clientLogo: data.client_logo ?? "",
    primaryColor: data.primary_color || DEFAULT_BRANDING.primaryColor,
    accentColor: data.accent_color || DEFAULT_BRANDING.accentColor,
  };
}

/** Grava (upsert) a configuração básica do cliente. Só o administrador deve chamar. */
export async function saveClientBranding(
  profile: string,
  cfg: BrandingConfig,
  updatedBy?: string | null,
): Promise<void> {
  if (!profile) throw new Error("Cliente não definido.");
  const { error } = await supabase.from("client_branding").upsert(
    {
      profile,
      client_name: cfg.clientName,
      client_logo: cfg.clientLogo,
      primary_color: cfg.primaryColor,
      accent_color: cfg.accentColor,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile" },
  );
  if (error) throw new Error(error.message);
}

/** Query da configuração básica do cliente ativo. */
export function useClientBranding(profile: string | null | undefined) {
  return useQuery({
    queryKey: ["client-branding", profile ?? null],
    queryFn: () => loadClientBranding(profile ?? ""),
    enabled: Boolean(profile),
    staleTime: 5 * 60_000,
  });
}

/**
 * Configuração EFETIVA: a própria do usuário (localStorage), se existir; senão a
 * básica do cliente; senão o padrão R&M. É o que deve valer ao logar.
 */
export function useEffectiveBranding(profile: string | null | undefined): BrandingConfig {
  const own = useBranding();
  const client = useClientBranding(profile);
  const ownSet = useSyncExternalStore(
    subscribe,
    () => hasOwnBranding(),
    () => false,
  );
  if (ownSet) return own;
  return client.data ?? DEFAULT_BRANDING;
}

/** Aplica a configuração efetiva (própria → cliente → padrão) nas CSS vars. */
export function useApplyEffectiveBranding(profile: string | null | undefined) {
  const b = useEffectiveBranding(profile);
  useEffect(() => {
    applyBranding(b);
  }, [b]);
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