# Integração `clearid-identity-hub` × Portal Argus (ArthosMFA)

Guia da integração **SSO por cookie compartilhado** do Portal Argus (ArthosMFA) no domínio `.rmtecho.com.br`, para autenticação de **USUÁRIO** do sistema.

> ## ⚠️ Design: coexistência com Supabase Auth (X1)
>
> **NÃO removemos** o Supabase Auth. Investigação revelou que ele **não é auth de usuário** — é uma **sessão técnica anônima** aberta em background (`ensureTechnicalSession` → `VITE_SUPABASE_APP_EMAIL/PASSWORD`) só para o RLS do Supabase liberar leitura/escrita de DADOS (branding, settings, campanhas de foto locais etc.).
>
> **Duas camadas independentes:**
>
> | Camada | Fonte | Cobre |
> |---|---|---|
> | **Auth de USUÁRIO** | Portal Argus (cookie SSO `rmtecho_token`) | Login humano, perfil, sites permitidos, permissões CRUD |
> | **Sessão técnica de DADOS** | Supabase (`VITE_SUPABASE_APP_EMAIL/PASSWORD`) | RLS Supabase abrindo pra ler branding/settings do próprio app |
>
> **Nada foi deletado.** O `tech-auth.ts`, `auth-attacher.ts`, `auth-middleware.ts` continuam. As seções 5 e 6 originais deste doc (que sugeriam deletar arquivos) **foram removidas** — o design final é coexistência.

- **Backend `ArgusClearId.Api`**: já está pronto (aceita cookie + expõe `GET /api/auth/me` + policies `Argus:Read/Write/Admin` + valida `X-Argus-Site`).
- **Frontend `clearid-identity-hub`**: este documento.
- **Portal Argus (ArthosMFA)**: setar cookie no login + emitir claims novas (`argus_profile_id`, `argus_sites`) — seção 9.

---

## 1. Arquitetura pós-migração

```
┌──────────────────┐ 1. login ┌──────────────────────┐
│ portal.rmtecho…  │─────────▶│ Portal Argus         │
│  (usuário)       │◀─────────│ (ArthosMFA)          │
└──────────────────┘  Set-Cookie: rmtecho_token
                       Domain=.rmtecho.com.br
                       HttpOnly; Secure; SameSite=Lax

     browser carrega cookie automaticamente ↓

┌──────────────────┐  fetch    ┌──────────────────────┐
│ clearid.rmtecho… │──────────▶│ argusclearidapi.     │
│  (SPA React)     │  cookie   │ rmtecho.com.br       │
│                  │  viaja    │  valida JWT +        │
│                  │  auto     │  policies Argus:*    │
└──────────────────┘           └──────────────────────┘
```

**Regras:**
- Cookie `rmtecho_token` é **HttpOnly** → JS não lê.
- Frontend só envia `credentials: 'include'` nos fetch; o browser cuida do resto.
- Para saber quem está logado (UI), o frontend chama `GET /api/auth/me` no backend.

---

## 2. 🆕 CRIAR arquivo `src/lib/portal-auth.ts`

```ts
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
 * Em dev:  http://localhost:5100/login  (ou o que estiver no .env)
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
```

---

## 3. 🆕 CRIAR arquivo `src/lib/current-user.ts`

```ts
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
  /** Perfil no app Argus (ex.: "Administrador", "Operador", "Consulta"). */
  argusProfile: string | null;
  /** Roles clássicas (legacy). */
  roles: string[];
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  traceId?: string;
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/auth/me`;

  const res = await fetch(url, {
    method: "GET",
    // ESSENCIAL: envia o cookie SSO .rmtecho.com.br para o backend.
    credentials: "include",
    headers: { Accept: "application/json" },
  });

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

  if (query.isSuccess && query.data === null && typeof window !== "undefined") {
    redirectToPortalLogin();
  }

  return query;
}

/**
 * Helpers de permissão — mapeiam o perfil do JWT nas policies do backend.
 */
export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return user?.argusProfile?.toLowerCase() === "administrador";
}

export function canWrite(user: CurrentUser | null | undefined): boolean {
  const p = user?.argusProfile?.toLowerCase();
  return p === "administrador" || p === "operador";
}

export function canRead(user: CurrentUser | null | undefined): boolean {
  return (
    user?.apps?.some((a) => a.toLowerCase() === "argus") === true &&
    !!user?.argusProfile
  );
}
```

---

## 4. ✏️ EDITAR `src/lib/argus-client.ts` — 4 substituições cirúrgicas

Todas as chamadas `fetch` precisam de `credentials: "include"` para que o cookie SSO viaje até o backend.

### 4.1. Próximo à linha 351

**Localizar:**
```ts
    response = await fetch(url, { ...init, headers });
```

**Substituir por:**
```ts
    // credentials: "include" garante que o cookie SSO rmtecho_token (HttpOnly, domínio .rmtecho.com.br)
    // viaje até o backend Argus. O `init` do chamador pode sobrescrever se necessário.
    response = await fetch(url, { credentials: "include", ...init, headers });
```

### 4.2. Próximo à linha 1620

**Localizar:**
```ts
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
```

**Substituir por:**
```ts
    const res = await fetch(url, { credentials: "include", headers });
    if (res.status === 404) return null;
```

### 4.3. Próximo à linha 1641

**Localizar:**
```ts
    const res = await fetch(url, { method: "POST", headers, body: form });
    if (!res.ok) {
```

**Substituir por:**
```ts
    const res = await fetch(url, { method: "POST", credentials: "include", headers, body: form });
    if (!res.ok) {
```

### 4.4. Próximo à linha 1671

**Localizar:**
```ts
    const res = await fetch(url, { method: "POST", headers, body: form });
    const body = await res.json().catch(() => null);
```

**Substituir por:**
```ts
    const res = await fetch(url, { method: "POST", credentials: "include", headers, body: form });
    const body = await res.json().catch(() => null);
```

---

## 5. ✏️ EDITAR `.env.example` — adicionar 1 var, manter Supabase

Adicionar **no topo** do `.env.example`:

```bash
# Portal Argus (ArthosMFA) — SSO por cookie compartilhado .rmtecho.com.br
VITE_PORTAL_ARGUS_LOGIN_URL="https://portal.rmtecho.com.br/login"
# (Opcional) Base da API do Portal Argus para /access-profiles/{id}/operations.
# VITE_PORTAL_ARGUS_API_URL="https://portal.rmtecho.com.br/api"
```

**Manter todo o bloco Supabase existente** — inclusive `VITE_SUPABASE_APP_EMAIL` e `VITE_SUPABASE_APP_PASSWORD`. Eles seguem sendo necessários para a **sessão técnica** que abre o Supabase para leitura/escrita de DADOS (branding, settings, etc.).

## 6. 🚫 Arquivos que NÃO devem ser deletados

Contrariamente à versão anterior deste doc, os arquivos abaixo **continuam em uso** como parte da sessão técnica do Supabase:

- `src/integrations/supabase/auth-attacher.ts` — anexa a sessão técnica em requests server-side (Nitro)
- `src/integrations/supabase/auth-middleware.ts` — middleware de dados
- `src/lib/tech-auth.ts` — abre a sessão técnica no cliente antes de usar o Supabase

O comentário do próprio `src/routes/_authenticated/route.tsx` deixa claro: *"Sessão técnica do Supabase (acesso a DADOS). A auth de USUÁRIO (Portal Argus) é verificada no AuthGuard abaixo."*

## 7. 🎯 Como aplicar a auth do Portal Argus em rotas

O `_authenticated/route.tsx` já usa um `AuthGuard`. Se ele hoje só checa presença de sessão Supabase (que é sempre `true` graças ao tech-auth), ele **não valida usuário real** — precisa passar a validar o cookie Portal Argus.

**Substituir o corpo do `AuthGuard`** (ou o `beforeLoad`) por:

```tsx
// AuthGuard.tsx (ou similar)
import { useRequireCurrentUser } from "~/lib/current-user";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useRequireCurrentUser();
  // useRequireCurrentUser redireciona pro Portal Argus se user === null
  if (isLoading || !user) return null;
  return <>{children}</>;
}
```

Para páginas específicas que precisam de perfil elevado (ex.: `/systems`), combinar com `usePermissions`:

```tsx
const { canRead } = usePermissions("systems");
if (!canRead) return <Navigate to="/" />;
```

## 8. ✅ Verificação após aplicar

```bash
# 1. Nada de resíduo do Supabase Auth
grep -rn "requireSupabaseAuth\|VITE_SUPABASE_APP_EMAIL\|VITE_SUPABASE_APP_PASSWORD\|tech-auth" src

# 2. Dev
yarn dev  # ou npm/bun run dev

# 3. Build
yarn build  # ou npm/bun run build
```

Erros de import de `~/integrations/supabase/auth-middleware`, `~/integrations/supabase/auth-attacher` ou `~/lib/tech-auth` = resíduo. Apagar os imports.

---

## 9. ⚠️ Pendente fora do escopo do frontend

Sem estes dois passos, o cookie **nunca aparece** para o frontend/backend.

### 9.1. Portal Argus (ArthosMFA) — setar cookie no login e remover no logout

```csharp
// Após emitir o JWT no login:
Response.Cookies.Append("rmtecho_token", token, new CookieOptions
{
    Domain   = ".rmtecho.com.br",   // permite subdomínios (clearid, argus, orcamento, gesta)
    HttpOnly = true,                // JS não lê — proteção XSS
    Secure   = true,                // só HTTPS
    SameSite = SameSiteMode.Lax,    // permite navegação cross-subdomain
    Expires  = DateTimeOffset.UtcNow.AddMinutes(jwtSection.GetValue<int>("ExpiresMinutes")),
});

// No logout:
Response.Cookies.Delete("rmtecho_token", new CookieOptions
{
    Domain = ".rmtecho.com.br",
    Secure = true,
});
```

### 9.2. Cadastrar no Portal Argus

- App `argus` (código: `argus`)
- Perfis: `Administrador`, `Operador`, `Consulta`
- Conceder o app `argus` aos usuários que devem entrar no `clearid-identity-hub`

---

## 10. 📌 Contrato de JWT esperado pelo backend

O backend `ArgusClearId.Api` valida o JWT recebido (via cookie ou header) contra:

```json
"AuthenticationSettings": {
  "JwtIssuer":   "ArthosMFA",
  "JwtAudience": "ArthosMFAClient",
  "JwtSecret":   "<mesma Jwt:Key do ArthosMFA — via User Secrets>"
}
```

Claims esperadas no payload:
```json
{
  "sub":          "<username>",
  "apps":         "argus",
  "app_profiles": "argus:Administrador"
}
```

Endpoint de checagem: `GET /api/auth/me` (retorna `{ username, apps, argusProfile, roles }`).

Policies aplicadas nos endpoints do backend:

| Policy | Requisitos |
|---|---|
| `Argus:Read` | `apps=argus` — qualquer perfil autenticado |
| `Argus:Write` | `apps=argus` + `app_profiles=argus:Administrador` OU `argus:Operador` |
| `Argus:Admin` | `apps=argus` + `app_profiles=argus:Administrador` |

---

## 11. 🧪 Teste ponta a ponta

1. **Portal Argus** → login com usuário que tem `argus:Administrador`.
2. **DevTools** → Application → Cookies → verificar `rmtecho_token` no domínio `.rmtecho.com.br`.
3. **Abrir** `https://clearid.rmtecho.com.br/` → o cookie viaja.
4. **Chamar** `GET /api/auth/me` (via UI ou DevTools) → deve retornar `{ username, apps: ["argus"], argusProfile: "Administrador" }`.
5. **Chamar** endpoint protegido (ex.: `GET /api/sites`) → deve retornar 200.
6. **Logout** no Portal Argus → cookie removido → próxima chamada retorna 401 → guard redireciona pro login.

---

## 12. 🛠️ Modo dev local (sem portal rodando)

Enquanto o portal não emite cookie, para trabalhar local:

- **Opção A** — Deixar `AuthenticationSettings.Enabled = false` no `appsettings.Development.json` do backend → bypass total da auth.
- **Opção B** — Usar o `POST /api/auth/login` local do backend para emitir um token e injetá-lo manualmente como cookie no DevTools (Application → Cookies → Add cookie `rmtecho_token` no domínio da API).

---

**Fim.** Qualquer dúvida, o backend correspondente está em `/DevOps/AI Projects/ArgusClearID/ArgusClearId.Api/` e a doc de integração dos apps está em `/DevOps/AI Projects/PortalArgus/docs/INTEGRATION_APPS.md`.
