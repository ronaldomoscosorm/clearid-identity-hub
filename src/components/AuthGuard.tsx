import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { redirectToPortalLogin } from "@/lib/portal-auth";
import { AccessDenied } from "@/components/AccessDenied";

// Código do app no Portal Argus (Applications.Code). O JWT emitido pelo
// ArthosMFA inclui esse código na claim "apps" quando o usuário tem grant.
const ARGUS_APP_CODE = "clearid";

/** Marca (por aba) do último redirect ao login — usada só p/ detectar loop rápido. */
const REDIRECTED_FLAG = "portal_auth_redirected";
/**
 * Janela do loop-guard: só bloqueia um novo redirect se o anterior foi há menos que
 * isto (ms). Assim um loop real (clearid → login → clearid automático) é contido, mas
 * uma nova visita legítima sem sessão (o usuário digita a URL de novo) redireciona normal.
 */
const REDIRECT_LOOP_WINDOW_MS = 10_000;

/**
 * Guarda de autenticação de USUÁRIO (Portal Argus / SSO por cookie).
 *
 * Comportamento (fail-closed): se NÃO houver um usuário confirmado — seja porque
 * o backend respondeu "sem usuário" (401/403) OU porque não deu para verificar
 * (erro de rede/CORS/timeout) — redireciona para o login do Portal Argus.
 *
 * Proteção contra loop (por tempo): se acabou de redirecionar (< janela) e voltou
 * sem usuário, renderiza em vez de redirecionar de novo (evita loop clearid↔login).
 * Uma nova visita sem sessão, fora da janela, redireciona normalmente. Ao autenticar,
 * a marca é limpa.
 *
 * A auth de DADOS continua pela sessão técnica do Supabase (independente disto).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isError, isSuccess } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);

  // ⚠️ BYPASS TEMPORÁRIO: ignora completamente a autenticação — nenhum redirect
  // para o Portal Argus, nenhum bloqueio por grant. O app entra direto.
  const bypassAccessScope = import.meta.env.VITE_DISABLE_ACCESS_SCOPE === "true";

  useEffect(() => {
    if (bypassAccessScope) return; // não redireciona, não valida
    // Autenticado de verdade: precisa ter username preenchido.
    // Backend em modo bypass (AuthenticationSettings.Enabled=false) responde 200
    // com objeto vazio ({ username: "", apps: [], ... }) — isso NÃO conta como
    // usuário real. Sem username, tratamos como não autenticado.
    const hasRealUser = !!data && !!data.username && data.username.length > 0;
    if (hasRealUser) {
      try { sessionStorage.removeItem(REDIRECTED_FLAG); } catch { /* ignore */ }
      return;
    }
    // Sem usuário confirmado: backend disse null/vazio OU falhou verificar (erro/CORS).
    const noUser = isSuccess || isError;
    if (!noUser) return; // ainda verificando

    // Guard de loop POR TEMPO: se acabamos de redirecionar (< janela) e voltamos sem
    // usuário, é loop → renderiza em vez de redirecionar de novo. Fora da janela,
    // uma nova visita sem sessão redireciona normalmente ao login.
    let lastTs = 0;
    try { lastTs = Number(sessionStorage.getItem(REDIRECTED_FLAG)) || 0; } catch { /* ignore */ }
    if (Date.now() - lastTs < REDIRECT_LOOP_WINDOW_MS) return;
    try { sessionStorage.setItem(REDIRECTED_FLAG, String(Date.now())); } catch { /* ignore */ }
    setRedirecting(true);
    redirectToPortalLogin();
  }, [isSuccess, isError, data, bypassAccessScope]);

  if (redirecting) return <AuthSplash label="Redirecionando ao login…" />;

  // Autenticado mas SEM grant para o app "clearid" → tela de acesso negado.
  // NÃO bloqueia mais por falta de sites: a permissão de SITE é enforçada no
  // backend (ArgusSiteRequirement/policies do ArgusClearId.Api). Bloquear aqui
  // deixava o app inteiro inacessível quando o `sites` do /me vinha vazio.
  if (!bypassAccessScope && data && data.username) {
    const hasArgusApp = data.apps?.some(
      (a) => a?.toLowerCase() === ARGUS_APP_CODE,
    );
    if (!hasArgusApp) {
      return <AccessDenied username={data.username} reason="no-app" />;
    }
  }

  return <>{children}</>;
}

function AuthSplash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
