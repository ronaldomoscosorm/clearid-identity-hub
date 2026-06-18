## Objetivo

Frontend web para operar o backend `ArgusClearId.Api` (.NET, fora do Lovable). Visual clean corporativo claro, login obrigatório, seletor de ambiente Demo/Produção e CRUD de Identities via Identity Service v4.

## Stack

- TanStack Start (já provisionado) + React 19 + Tailwind v4 + shadcn/ui
- TanStack Query para dados, react-hook-form + zod para formulários
- Lovable Cloud (Supabase) só para **autenticação do app** (login/logout dos operadores R&M) — sem tabelas de negócio
- Sem chamadas server-side ao ArgusClearId: o browser chama direto a URL configurável (mais simples e a auth do backend é client_credentials emitida pelo próprio .NET, não exposta ao browser)

> Importante: o token OAuth do ClearID **não** roda no browser. Esse projeto consome **endpoints já protegidos do ArgusClearId.Api** (ex.: `/api/identities`, `/api/diagnostics`), que internamente fazem o `client_credentials` contra a Genetec. Para o browser autenticar contra o ArgusClearId.Api, assumimos um esquema **Bearer JWT emitido após login Supabase** OU **API Key fixa por ambiente** — confirmar abaixo.

## Configuração de ambientes

Página `Settings` (persistida em `localStorage`, por usuário/navegador):

| Campo | Demo | Produção |
|---|---|---|
| Base URL | `https://argusclearid-demo.rm.local` | `https://argusclearid.rm.local` |
| API Key/Token (opcional) | string | string |

Toggle global no header (`Demo` | `Prod`) — TODAS as chamadas usam a base URL/credencial do ambiente ativo. Persistido em `localStorage` (`argus.env`).

## Estrutura de rotas

```text
src/routes/
  __root.tsx                  layout: header + env toggle + user menu
  index.tsx                   redirect -> /identities (se logado) ou /auth
  auth.tsx                    login/signup (email+senha, Supabase)
  _authenticated/
    route.tsx                 gate (já provisionado pela integração)
    identities.tsx            lista + filtros + busca
    identities.new.tsx        criar identity
    identities.$id.tsx        ver/editar/desativar
    diagnostics.tsx           health do backend + status token ClearID
    settings.tsx              base URLs e tokens por ambiente
```

## Camada de API (browser)

`src/lib/argus-client.ts`:

```ts
async function argusFetch(path: string, init?: RequestInit) {
  const env = getCurrentEnv();          // 'demo' | 'prod'
  const cfg = getEnvConfig(env);        // { baseUrl, apiKey }
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Environment': env,
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...init?.headers,
    },
  });
}
```

Hooks com TanStack Query:
- `useIdentities(filters)` — GET `/api/identities`
- `useIdentity(id)` — GET `/api/identities/:id`
- `useCreateIdentity()` — POST
- `useUpdateIdentity()` — PUT
- `useDeactivateIdentity()` — DELETE/PATCH
- `useDiagnostics()` — GET `/api/diagnostics` (refetch a cada 30s)

## Telas

**Auth** — email/senha via Supabase, link de signup, redirect para `/identities`.

**Identities (lista)** — tabela com colunas: ExternalId, Nome, E-mail, Status, Última atualização. Busca por nome/externalId, filtro de status, paginação, botão "Nova identity".

**Identity (detalhe/edição)** — form com seções: Identificação (externalId readonly após criar, firstName, lastName, email), Atributos customizados (key/value dinâmico), Status (ativo/inativo). Botões Salvar / Desativar / Voltar. Validação com zod.

**Identity (nova)** — mesmo form vazio.

**Diagnostics** — cards:
- Backend reachable (status + latência)
- Ambiente atual (Demo/Prod + base URL)
- ClearID token (válido até / expira em)
- Account ID
- Última chamada testada
Botão "Rodar diagnóstico agora".

**Settings** — dois blocos (Demo / Prod) com `baseUrl` + `apiKey`. Salvar grava em `localStorage`. Botão "Testar conexão".

## Visual

Tema claro corporativo:
- Fundo `#F7F8FA`, surface `#FFFFFF`, borda `#E5E7EB`
- Primária R&M-style azul profundo `#1E3A8A`, accent `#2563EB`, texto `#0F172A`, muted `#64748B`
- Status: success `#16A34A`, warning `#D97706`, danger `#DC2626`
- Tipografia: Inter (headings semibold, body regular)
- Densidade média, cantos `rounded-lg`, sombras sutis
- Header fixo: logo "Argus ClearID" + breadcrumbs + toggle Demo/Prod (badge colorido: cinza demo, azul prod) + avatar/logout

Tudo via tokens semânticos em `src/styles.css` (sem cores hardcoded em componentes).

## Lovable Cloud

Habilitar para usar Auth (email/senha). Sem tabelas adicionais — perfil é só `auth.users`.

## Detalhes técnicos

- `argus.env` e `argus.config.{demo,prod}` em `localStorage`; helper `useEnv()` com `useSyncExternalStore` para reatividade do header.
- Erros de fetch: toast com mensagem do backend (`{ error, traceId }`); botão "copiar TraceId".
- Loading: skeletons nas listas, `Suspense` boundaries onde possível.
- Schema das identities baseado no que o `_sample` do ArgusClearId expõe (campos comuns: externalId, firstName, lastName, email, status, customFields). Ajustável depois ao tipo real.

## Perguntas antes de implementar

1. **Auth do ArgusClearId.Api perante o browser**: o backend aceita `Authorization: Bearer <token>` configurável (API Key fixa por ambiente) — OK? Ou prefere validar JWT do Supabase no .NET?
2. **CORS**: o ArgusClearId.Api precisa liberar a origem `*.lovable.app` (preview) e o domínio final. Já está previsto?
3. **Esquema de Identity**: posso assumir `{ externalId, firstName, lastName, email, status, customFields: Record<string,string> }` por ora?

Se preferir, respondo "ok, segue padrão" e eu implemento com essas premissas.
