// SSO via localStorage — bypass do cookie compartilhado.
//
// Motivação: em prod, o cookie do Portal Argus (`rmtecho_token`) não é
// propagado entre subdomínios devido a config do ArthosMFA que grava sem
// `Domain=.rmtecho.com.br`. Para desacoplar o SSO desse detalhe de infra,
// este módulo:
//   1. Lê o JWT do fragment da URL (#token=…) no bootstrap.
//   2. Persiste em localStorage.
//   3. É consumido pelo argus-client (Authorization: Bearer) e pelo
//      useCurrentUser (decodifica local sem bater no backend).
//
// Trade-off aceito: JWT visível ao JS (localStorage). XSS pode roubar.
// Mitigação: TokenExpirationMinutes curto no ArthosMFA + rotação.

const STORAGE_KEY = "argus.ssoToken";

/** Retorna o JWT armazenado ou null. */
export function getSsoToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const t = window.localStorage.getItem(STORAGE_KEY);
    return t && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

/** Persiste o JWT. */
export function setSsoToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

/** Limpa o JWT (logout). */
export function clearSsoToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Se a URL tem `#token=<jwt>` (redirecionado do Portal Argus), extrai,
 * persiste e limpa o fragment. Retorna true se algo foi capturado.
 * Chamar 1x no bootstrap da app, ANTES das primeiras requests.
 */
export function captureTokenFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (!hash || !hash.includes("token=")) return false;
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const token = params.get("token");
  if (!token) return false;
  setSsoToken(token);
  // Limpa o fragment sem gerar navegação (evita loop e mantém histórico).
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", cleanUrl);
  return true;
}

/** Interface do payload esperado no JWT emitido pelo ArthosMFA. */
export interface SsoClaims {
  username: string;
  apps: string[];
  appProfiles: string[];   // "clearid:Administrator"
  argusProfileId: string | null;
  argusSites: string[];    // "corteva:LA-BR-Alphaville"
  argusProfile: string | null; // extraído de appProfiles[apps=clearid]
  roles: string[];
  exp: number;
  iss?: string;
  aud?: string;
}

/**
 * Decodifica payload de JWT sem validar assinatura (assinatura é validada
 * no backend). Uso: preencher useCurrentUser sem hit no /api/auth/me.
 */
export function decodeSsoToken(token: string | null | undefined): SsoClaims | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob(padded);
    const decoded = decodeURIComponent(
      Array.from(raw)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const json = JSON.parse(decoded) as Record<string, unknown>;

    const asArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];

    const apps = asArray(json.apps);
    const appProfiles = asArray(json.app_profiles);
    const argusSites = asArray(json.argus_sites);
    const roles = asArray(
      json["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ?? json.role,
    );
    const username = String(
      json["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] ??
        json.unique_name ??
        json.name ??
        "",
    );
    const argusProfile =
      appProfiles
        .filter((p) => p.toLowerCase().startsWith("clearid:"))
        .map((p) => p.split(":")[1])
        .find((p) => !!p) ?? null;

    return {
      username,
      apps,
      appProfiles,
      argusProfileId: json.argus_profile_id ? String(json.argus_profile_id) : null,
      argusSites,
      argusProfile,
      roles,
      exp: typeof json.exp === "number" ? json.exp : 0,
      iss: typeof json.iss === "string" ? json.iss : undefined,
      aud: typeof json.aud === "string" ? json.aud : undefined,
    };
  } catch {
    return null;
  }
}

/** true se o JWT ainda não expirou (com margem de 30s). */
export function isSsoTokenValid(claims: SsoClaims | null | undefined): boolean {
  if (!claims || !claims.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return claims.exp > nowSec + 30;
}
