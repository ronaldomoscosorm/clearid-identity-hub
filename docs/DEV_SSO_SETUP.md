# Ambiente de teste com SSO real (frontends locais × backends de produção)

## Por que este setup é necessário

Topologia de teste:

| Peça | Onde |
|------|------|
| Frontend clearid | local (`8080`) |
| Frontend portal-argus | local (`5173`) |
| Backend clearid | produção — `argusclearidapi.rmtecho.com.br` |
| Backend/API portal | produção — `portal.rmtecho.com.br` |

O cookie SSO `rmtecho_token` é emitido pelo backend como:

```csharp
new CookieOptions { Domain = ".rmtecho.com.br", Secure = true, HttpOnly = true, SameSite = SameSiteMode.Lax }
```

`SameSite=Lax` **não é enviado em requisições cross-site de subrecurso** (um `fetch` de
`http://localhost:8080` para `argusclearidapi.rmtecho.com.br` é cross-site). Resultado:
`GET /api/auth/me` chega **sem** o cookie → usuário vazio → o app cai no fallback e
mostra todos os clientes/menus.

Em **produção** funciona porque `clearid.rmtecho.com.br` e `argusclearidapi.rmtecho.com.br`
são **same-site** (mesmo `rmtecho.com.br`). A solução para o teste é reproduzir isso:
servir os frontends sob hosts `*.rmtecho.com.br` por **HTTPS**.

> CORS não é obstáculo: o backend clearid usa `SetIsOriginAllowed(_ => true).AllowCredentials()`.
> O bloqueio é exclusivamente o `SameSite=Lax` do cookie.

## Passo a passo (uma vez)

### 1. Hosts locais (precisa de sudo)

Adicione ao `/etc/hosts`:

```
127.0.0.1  dev-clearid.rmtecho.com.br
127.0.0.1  dev-portal.rmtecho.com.br
```

```bash
sudo sh -c 'printf "127.0.0.1  dev-clearid.rmtecho.com.br\n127.0.0.1  dev-portal.rmtecho.com.br\n" >> /etc/hosts'
```

### 2. Certificados confiáveis (mkcert)

```bash
brew install mkcert nss
mkcert -install
```

No repo do **clearid**:

```bash
mkdir -p certs && cd certs && mkcert dev-clearid.rmtecho.com.br && cd ..
```

No repo do **portal-argus-frontend**:

```bash
mkdir -p certs && cd certs && mkcert dev-portal.rmtecho.com.br && cd ..
```

Cada `mkcert <host>` gera `<host>.pem` e `<host>-key.pem` — os nomes que os
`vite.config.ts` já procuram. Com os arquivos presentes, o Vite liga o HTTPS sozinho.

### 3. Subir os frontends

```bash
# clearid
PORT=8080 yarn dev      # → https://dev-clearid.rmtecho.com.br:8080

# portal-argus-frontend
yarn dev                # → https://dev-portal.rmtecho.com.br:5173
```

## Fluxo de teste

1. Abra **https://dev-portal.rmtecho.com.br:5173** e faça login (o cookie `.rmtecho.com.br`
   é gravado *first-party*).
2. Abra **https://dev-clearid.rmtecho.com.br:8080**. O `fetch` para o backend agora é
   *same-site* → o cookie Lax é enviado → `/api/auth/me` retorna o usuário real →
   nome, menus, clientes e sites restritos ao usuário.

## Configuração já aplicada no repo

- `VITE_ARGUS_API_BASE_URL="https://argusclearidapi.rmtecho.com.br"` (`.env`)
- `VITE_PORTAL_ARGUS_LOGIN_URL="https://dev-portal.rmtecho.com.br:5173/login"` (`.env`)
- `vite.config.ts`: HTTPS condicional + `allowedHosts` (clearid e portal)
- `certs/` no `.gitignore` (nunca versionar as chaves)

## Voltar ao `yarn dev` normal

Sem os certificados em `certs/`, o Vite serve em `http://localhost` como antes.
Para o SSO, porém, é obrigatório o host `*.rmtecho.com.br` + HTTPS acima.
