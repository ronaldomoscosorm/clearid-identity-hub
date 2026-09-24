// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// SSO cross-site em dev: o cookie `rmtecho_token` é SameSite=Lax + Domain=.rmtecho.com.br,
// então só chega ao backend se o front rodar sob um host *.rmtecho.com.br por HTTPS
// (same-site). Gere o certificado com mkcert (ver docs/DEV_SSO_SETUP.md) e o Vite
// passa a servir em HTTPS automaticamente. Sem o certificado, o `yarn dev` normal
// (http://localhost) segue funcionando.
// HTTPS é opt-in: só liga com DEV_HTTPS=1 (e o certificado presente). Assim o
// `yarn dev` normal segue em http://localhost (ex.: modo mock), e o SSO same-site
// roda com `DEV_HTTPS=1 yarn dev` em https://dev-clearid.rmtecho.com.br:8080.
const CERT_DIR = resolve(process.cwd(), "certs");
const KEY = resolve(CERT_DIR, "dev-clearid.rmtecho.com.br-key.pem");
const CERT = resolve(CERT_DIR, "dev-clearid.rmtecho.com.br.pem");
const httpsReady = process.env.DEV_HTTPS === "1" && existsSync(KEY) && existsSync(CERT);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Vite bloqueia hosts desconhecidos por padrão; libera o host de dev SSO.
      allowedHosts: ["dev-clearid.rmtecho.com.br"],
      ...(httpsReady
        ? { https: { key: readFileSync(KEY), cert: readFileSync(CERT) } }
        : {}),
    },
  },
});
