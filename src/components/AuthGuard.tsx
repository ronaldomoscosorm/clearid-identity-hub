import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { redirectToPortalLogin } from "@/lib/portal-auth";
import { AccessDenied } from "@/components/AccessDenied";

// Código do app no Portal Argus (Applications.Code). O JWT emitido pelo
// ArthosMFA inclui esse código na claim "apps" quando o usuário tem grant.
const ARGUS_APP_CODE = "clearid";

/** Flag (por aba) que evita loop de redirect quando o cookie não pode ser obtido. */
const REDIRECTED_FLAG = "portal_auth_redirected";

/**
 * Guarda de autenticação de USUÁRIO (Portal Argus / SSO por cookie).
 *
 * Comportamento (fail-closed): se NÃO houver um usuário confirmado — seja porque
 * o backend respondeu "sem usuário" (401/403) OU porque não deu para verificar
 * (erro de rede/CORS/timeout) — redireciona para o login do Portal Argus.
 *
 * Proteção contra loop: redireciona no máximo UMA vez por aba (sessionStorage).
 * Se, após o redirect, o app for reaberto e ainda não houver usuário (ex.: em
 * `localhost`, onde o cookie `.rmtecho.com.br` não existe), o app é renderizado
 * em vez de redirecionar de novo. Ao autenticar, a flag é limpa.
 *
 * A auth de DADOS continua pela sessão técnica do Supabase (independente disto).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isError, isSuccess } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
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

    // Guard de loop: redireciona no máximo uma vez por aba.
    let already = false;
    try { already = !!sessionStorage.getItem(REDIRECTED_FLAG); } catch { /* ignore */ }
    if (already) return; // já tentou → renderiza o app (evita loop)
    try { sessionStorage.setItem(REDIRECTED_FLAG, "1"); } catch { /* ignore */ }
    setRedirecting(true);
    redirectToPortalLogin();
  }, [isSuccess, isError, data]);

  if (redirecting) return <AuthSplash label="Redirecionando ao login…" />;

  // Autenticado mas SEM grant para o app "argus" → tela de acesso negado.
  if (data && data.username) {
    const hasArgusApp = data.apps?.some(
      (a) => a?.toLowerCase() === ARGUS_APP_CODE,
    );
    if (!hasArgusApp) {
      return <AccessDenied username={data.username} reason="no-app" />;
    }
    if (!data.sites || data.sites.length === 0) {
      return <AccessDenied username={data.username} reason="no-sites" />;
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
