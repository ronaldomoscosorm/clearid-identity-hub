import { UserCircle } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";

/**
 * Indicador do usuário autenticado no Portal Argus (SSO por cookie).
 * Gracioso: não renderiza nada quando o backend não retorna um usuário
 * (ex.: dev sem portal, sessão expirada) — não bloqueia nem polui a UI.
 * A auth de DADOS (Supabase) continua pela sessão técnica; este badge reflete
 * apenas a identidade de usuário vinda do backend Argus.
 */
export function CurrentUserBadge() {
  const { data: user } = useCurrentUser();
  // Backend sem cookie válido responde 200 com usuário vazio (username="").
  if (!user?.username) return null;
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--rm-line)] bg-[var(--rm-panel-2)] px-2 py-1.5 text-xs">
      <UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 leading-tight">
        <div className="truncate font-medium text-foreground">{user.username}</div>
        {user.argusProfile && (
          <div className="truncate text-muted-foreground">{user.argusProfile}</div>
        )}
      </div>
    </div>
  );
}
