import { AlertTriangle, LogOut, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPortalArgusLoginUrl, getPortalArgusLogoutUrl } from "@/lib/portal-auth";

/**
 * Tela exibida quando o usuário está autenticado no Portal Argus (cookie SSO válido),
 * porém NÃO tem grant para acessar o app ClearID (claim `apps` sem "argus"), ou tem
 * grant no app mas não tem nenhum site vinculado.
 *
 * O usuário tem 2 saídas:
 *   1. Voltar ao Portal Argus — para escolher outro app que ele tenha acesso.
 *   2. Sair — remove o cookie SSO (via logout do Portal) e volta ao login.
 */
export function AccessDenied({
  username,
  reason,
}: {
  username: string;
  reason: "no-app" | "no-sites";
}) {
  const message =
    reason === "no-app"
      ? "Você está autenticado, mas ainda não tem permissão para acessar o ClearID."
      : "Você tem acesso ao ClearID, mas nenhum site foi liberado ao seu usuário.";

  const detail =
    reason === "no-app"
      ? "Peça ao administrador para conceder o app 'ClearID' ao seu usuário no Portal Argus."
      : "Peça ao administrador para vincular ao menos um site (cliente + unidade) ao seu usuário no Portal Argus.";

  const portalUrl = getPortalArgusLoginUrl();
  // Logout: endpoint do Portal (API) que apaga o cookie SSO e volta ao login.
  const logoutUrl = getPortalArgusLogoutUrl();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <h1 className="mb-2 text-center text-xl font-semibold">Acesso negado ao ClearID</h1>

        <p className="mb-2 text-center text-sm text-muted-foreground">
          Usuário autenticado: <span className="font-medium text-foreground">{username}</span>
        </p>

        <p className="mb-4 text-center text-sm text-muted-foreground">{message}</p>

        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {detail}
        </div>

        <div className="flex flex-col gap-2">
          <Button asChild variant="default">
            <a href={portalUrl}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Portal Argus
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={logoutUrl}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
