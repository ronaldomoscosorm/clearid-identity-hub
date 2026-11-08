/**
 * Integração com o Portal Argus (ArthosMFA) via SSO por cookie compartilhado.
 *
 * Fluxo:
 * 1. Usuário faz login no Portal Argus (https://portal.rmtecho.com.br).
 * 2. Portal seta cookie HttpOnly `rmtecho_token` no domínio `.rmtecho.com.br`.
 * 3. Este frontend (clearid.rmtecho.com.br) e o backend (argusclearidapi.rmtecho.com.br)
 *    recebem o cookie automaticamente em toda requisição same-site.
 * 4. Frontend não precisa ler o token — apenas envia `credentials: 'include'` nos fetch.
 * 5. Backend valida o JWT (Issuer=ArthosMFA, Audience=ArthosMFAClient) e aplica as
 *    policies Argus:Read / Argus:Write / Argus:Admin com base nas claims
 *    `apps` e `app_profiles`.
 *
 * Como o cookie é HttpOnly, JS NÃO consegue ler o token diretamente. Para saber quem
 * está logado, o frontend chama `GET /api/auth/me` no backend (ver useCurrentUser).
 */

const COOKIE_NAME = "rmtecho_token";

/**
 * URL absoluta do login do Portal Argus, configurável via env.
 * Em prod: https://portal.rmtecho.com.br/login
 * Em dev:  http://localhost:5173/login  (ou o que estiver no .env)
 */
export function getPortalArgusLoginUrl(returnUrl?: string): string {
  const base =
    (import.meta.env.VITE_PORTAL_ARGUS_LOGIN_URL as string | undefined) ??
    "https://portal.rmtecho.com.br/login";

  const url = new URL(base);
  if (returnUrl) {
    url.searchParams.set("returnUrl", returnUrl);
  }
  return url.toString();
}

/**
 * Redireciona o navegador para o login do Portal Argus, guardando a URL atual como retorno.
 * Chame quando detectar 401/sessão expirada.
 */
export function redirectToPortalLogin(currentUrl?: string): void {
  if (typeof window === "undefined") return;
  const returnUrl = currentUrl ?? window.location.href;
  window.location.assign(getPortalArgusLoginUrl(returnUrl));
}

/**
 * URL de logout do Portal Argus: a rota `/logout` da SPA do Portal (mesma
 * origem do login). Essa página limpa o token do Portal (localStorage de
 * portalargus), chama o endpoint da API que apaga o cookie SSO `rmtecho_token`
 * (.rmtecho.com.br) e cai na tela de login. `returnUrl` (padrão: origem do
 * ClearID) é repassado ao login para o usuário voltar ao ClearID após entrar.
 *
 * IMPORTANTE: NÃO chamar só o endpoint da API (`{API}/auth/logout`): ele apaga o
 * cookie, mas o Portal continua "logado" pelo localStorage e a tela de login,
 * ao receber `returnUrl`, devolve o usuário ao ClearID sem pedir senha.
 */
export function getPortalArgusLogoutUrl(returnUrl?: string): string {
  const loginUrl = new URL(getPortalArgusLoginUrl());
  const dest =
    returnUrl ??
    (typeof window !== "undefined" ? window.location.origin : "https://clearid.rmtecho.com.br");
  const url = new URL("/logout", loginUrl.origin);
  url.searchParams.set("returnUrl", dest);
  return url.toString();
}

/**
 * Encerra a sessão: limpa o token local e navega para o logout do Portal (que limpa
 * o localStorage do portalargus + cookie SSO compartilhado) e cai no login.
 */
export function redirectToLogout(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("portal_auth_redirected");
    // Limpa o JWT do SSO via localStorage (fluxo novo — bypass do cookie).
    localStorage.removeItem("argus.ssoToken");
  } catch {
    /* ignore */
  }
  window.location.assign(getPortalArgusLogoutUrl());
}

/**
 * Verifica no servidor (Nitro) se o cookie SSO está presente no request atual.
 * Não valida o token — apenas confirma que existe. A validação criptográfica é
 * responsabilidade do backend .NET.
 *
 * Uso em loaders/beforeLoad server-side do TanStack Router.
 */
export function hasPortalAuthCookieServer(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .some((c) => c.startsWith(`${COOKIE_NAME}=`) && c.length > COOKIE_NAME.length + 1);
}
