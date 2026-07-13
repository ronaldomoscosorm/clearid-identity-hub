# Deploy no IIS (Node + reverse proxy)

O app é um servidor **Node (Nitro)**. O IIS não roda Node nativamente, então ele
atua como **reverse proxy** para o processo Node.

> ⚠️ O build **padrão** do projeto (`yarn build`) gera um bundle **Cloudflare
> Workers** (não escuta porta). Para IIS/Node use **`yarn build:node`**, que força
> o preset `node-server`.

---

## 1. Build (na máquina de build)

Antes de buildar, o `.env` precisa ter os valores de PRODUÇÃO (as `VITE_*` são
"cozidas" no bundle):

```
VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_APP_EMAIL, VITE_SUPABASE_APP_PASSWORD
```

Então:

```bash
yarn install
yarn build:node        # gera .output/ com servidor Node
```

Copie a pasta **`.output/`** inteira para o servidor, ex.: `C:\apps\clearid\`.

---

## 2. Node no servidor + serviço do Windows

1. Instale **Node.js LTS** no Windows Server.
2. As variáveis de **runtime** (lidas pelo servidor) precisam existir no ambiente
   do serviço:
   - `PORT=3000`
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Rode como serviço com **nssm** (https://nssm.cc):

```bat
nssm install ClearID "C:\Program Files\nodejs\node.exe" "C:\apps\clearid\server\index.mjs"
nssm set ClearID AppDirectory "C:\apps\clearid"
nssm set ClearID AppEnvironmentExtra PORT=3000 SUPABASE_URL=https://SEU-PROJ.supabase.co SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
nssm start ClearID
```

Teste local no servidor: `http://localhost:3000/identities` deve responder.

---

## 3. IIS como reverse proxy

1. Instale os módulos **URL Rewrite** e **Application Request Routing (ARR)**.
2. No IIS Manager (nó do servidor) → **Application Request Routing Cache** →
   *Server Proxy Settings* → marque **Enable proxy**.
3. Crie o **site** no IIS com o domínio (`clearid.rmtecho.com.br`) e o certificado
   SSL. Aponte a pasta física para uma pasta vazia contendo apenas o
   [`web.config`](./web.config) deste diretório (copie-o para a raiz do site).
4. O `web.config` já repassa tudo para `http://localhost:3000`. Ajuste a porta se
   necessário.

---

## 4. Checklist

- [ ] `yarn build:node` (não `yarn build`)
- [ ] `.env` com `VITE_*` de produção antes do build
- [ ] `.output/` copiado para o servidor
- [ ] Node LTS instalado
- [ ] Serviço (nssm) com `PORT` + `SUPABASE_*` de runtime
- [ ] `localhost:3000` respondendo no servidor
- [ ] IIS com URL Rewrite + ARR (Enable proxy)
- [ ] Site IIS com domínio + SSL + `web.config` de proxy
- [ ] Anonymous sign-ins / usuário técnico do Supabase configurado (auth)
