import { audit } from "@/lib/audit";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { AuthCheckError, useCurrentUser } from "@/lib/current-user";
import { redirectToPortalLogin } from "@/lib/portal-auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "@/components/AccessDenied";

/** Intervalo entre novas tentativas automáticas enquanto a API não responde. */
const RETRY_INTERVAL_MS = 10_000;

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
  const { data, isError, isSuccess, error, refetch, isFetching } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);
  // Falhas transitórias consecutivas (timeout/rede/5xx) desde o último sucesso.
  const [failures, setFailures] = useState(0);
  const lastFailure = useRef<{ kind: string; status?: number; elapsedMs: number } | null>(null);

  // Falha transitória: NÃO redireciona. Registra, agenda nova tentativa e, quando a API
  // volta, grava na auditoria que a sessão foi mantida (evidência para as "quedas").
  useEffect(() => {
    if (!isError) return;
    const e = error instanceof AuthCheckError ? error : null;
    lastFailure.current = { kind: e?.kind ?? "unknown", status: e?.status, elapsedMs: e?.elapsedMs ?? 0 };
    setFailures((n) => n + 1);
    const timer = window.setTimeout(() => { void refetch(); }, RETRY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [isError, error, refetch]);

  useEffect(() => {
    if (!isSuccess || failures === 0) return;
    const f = lastFailure.current;
    audit({
      action: "other",
      entityType: "session",
      summary: `Sessão mantida após ${failures} falha(s) na verificação (${f?.kind ?? "?"}${f?.status ? ` HTTP ${f.status}` : ""})`,
      details: { event: "auth_check_recovered", attempts: failures, ...f },
    });
    setFailures(0);
    lastFailure.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

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
      // Registra o login uma vez por sessão do navegador.
      try {
        if (!sessionStorage.getItem("audit_login_done")) {
          sessionStorage.setItem("audit_login_done", "1");
          audit({ action: "login", entityType: "session", summary: "Entrou no sistema" });
        }
      } catch { /* ignore */ }
      try { sessionStorage.removeItem(REDIRECTED_FLAG); } catch { /* ignore */ }
      return;
    }
    // Só redireciona quando o backend CONFIRMOU "sem usuário" (401/403 → null, ou objeto
    // vazio). Falha transitória (isError) é tratada acima: nova tentativa, sessão mantida.
    if (!isSuccess) return; // ainda verificando, ou falha transitória

    // Guard de loop POR TEMPO: se acabamos de redirecionar (< janela) e voltamos sem
    // usuário, é loop → renderiza em vez de redirecionar de novo. Fora da janela,
    // uma nova visita sem sessão redireciona normalmente ao login.
    let lastTs = 0;
    try { lastTs = Number(sessionStorage.getItem(REDIRECTED_FLAG)) || 0; } catch { /* ignore */ }
    if (Date.now() - lastTs < REDIRECT_LOOP_WINDOW_MS) return;
    try { sessionStorage.setItem(REDIRECTED_FLAG, String(Date.now())); } catch { /* ignore */ }
    setRedirecting(true);
    redirectToPortalLogin();
  }, [isSuccess, data, bypassAccessScope]);

  if (redirecting) return <AuthSplash label="Redirecionando ao login…" />;
  if (isError && !bypassAccessScope) {
    return <AuthUnavailable failures={failures} fetching={isFetching} error={error} onRetry={() => void refetch()} />;
  }

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

/** API fora do ar ou lenta: mantém o usuário na tela, tenta de novo sozinho e oferece ações. */
function AuthUnavailable({
  failures, fetching, error, onRetry,
}: { failures: number; fetching: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useT();
  const e = error instanceof AuthCheckError ? error : null;
  const reason = e
    ? e.kind === "http" ? t("authGuard.reason.http", { status: e.status ?? 0 }) : t(`authGuard.reason.${e.kind}`)
    : t("authGuard.reason.unknown");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-8 w-8 text-[var(--rm-inactive-ink)]" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{t("authGuard.unavailable")}</p>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <p className="text-xs text-muted-foreground">
          {fetching ? t("authGuard.checking") : t("authGuard.retrying", { seconds: RETRY_INTERVAL_MS / 1000, attempts: failures })}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onRetry} disabled={fetching}>
          {fetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {t("authGuard.retryNow")}
        </Button>
        <Button variant="outline" onClick={() => redirectToPortalLogin()}>{t("authGuard.goLogin")}</Button>
      </div>
    </div>
  );
}

function AuthSplash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
