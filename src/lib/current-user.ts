import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConfig } from "./argus-env";
import { redirectToPortalLogin } from "./portal-auth";

/**
 * Perfil do usuário atualmente autenticado no Argus.
 *
 * Vem de `GET /api/auth/me` no backend, que lê as claims do JWT (Portal Argus
 * ou login local dev). Como o cookie SSO é HttpOnly, o único jeito de saber
 * quem está logado é perguntar pro backend.
 */
export interface CurrentUser {
  username: string;
  apps: string[];
  /** Perfil no app Argus (ex.: "Administrator", "Operator", "Viewer"). */
  argusProfile: string | null;
  /** Roles clássicas (legacy). */
  roles: string[];
  /**
   * ID do AccessProfile do usuário no Portal Argus (claim `argus_profile_id`).
   * Usado para consultar operações do profile em
   * `portal/api/access-profiles/{id}/operations`.
   * Em dev com backend em Enabled=false, virá "0" (bypass).
   */
  accessProfileId: string | null;
  /**
   * Sites permitidos ao usuário, formato `cliente:site`
   * (ex.: `corteva:LA-BR-Alphaville`).
   */
  sites: string[];
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  traceId?: string;
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  // Mock APENAS de desenvolvimento: quando o backend/Portal não estão acessíveis
  // (ex.: dev local com CORS bloqueando produção), permite testar as restrições
  // por usuário. Defina VITE_DEV_MOCK_USER no .env com um JSON de CurrentUser.
  // Nunca ativa em produção (guardado por import.meta.env.DEV).
  if (import.meta.env.DEV) {
    const raw = import.meta.env.VITE_DEV_MOCK_USER as string | undefined;
    if (raw && raw.trim()) {
      try {
        return JSON.parse(raw) as CurrentUser;
      } catch {
        console.warn("[auth] VITE_DEV_MOCK_USER inválido (JSON) — ignorando.");
      }
    }
  }

  const cfg = getConfig();
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/auth/me`;

  // Timeout para o check não ficar pendente (ex.: CORS/preflight lento em dev).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      // ESSENCIAL: envia o cookie SSO .rmtecho.com.br para o backend.
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Falha ao consultar /api/auth/me (HTTP ${res.status})`);
  }

  const envelope = (await res.json()) as ApiResponse<CurrentUser>;
  return envelope.data;
}

/**
 * Hook que retorna o usuário logado. Retorna `null` quando não autenticado
 * (o consumidor decide se redireciona pro login).
 *
 * Cache de 5 min — o perfil raramente muda dentro de uma sessão.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Versão que redireciona automaticamente pro login do Portal Argus se não autenticado.
 * Usar em telas que exigem sessão (rotas _authenticated).
 */
export function useRequireCurrentUser() {
  const query = useCurrentUser();

  // Redireciona ao Portal quando o backend confirma "sem usuário" (401/403 →
  // data === null) OU quando retorna um objeto vazio (username === ""), que é
  // o caso do bypass de dev (AuthenticationSettings.Enabled = false no backend).
  // Em erro de rede/CORS não redireciona — evita loop em dev local.
  useEffect(() => {
    if (!query.isSuccess || typeof window === "undefined") return;
    const noRealUser = !query.data || !query.data.username;
    if (noRealUser) redirectToPortalLogin();
  }, [query.isSuccess, query.data]);

  return query;
}

/**
 * Helpers de permissão — mapeiam o perfil do JWT nas policies do backend.
 * Os nomes de perfil estão em inglês (base de AccessProfiles do Portal Argus).
 */
export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return user?.argusProfile?.toLowerCase() === "administrator";
}

export function canWrite(user: CurrentUser | null | undefined): boolean {
  const p = user?.argusProfile?.toLowerCase();
  return p === "administrator" || p === "operator";
}

export function canRead(user: CurrentUser | null | undefined): boolean {
  return (
    user?.apps?.some((a) => a.toLowerCase() === "clearid") === true && !!user?.argusProfile
  );
}
