import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Shield, Activity, Settings as SettingsIcon, Users } from "lucide-react";
import { useArgusEnv, type ArgusEnvKey } from "@/lib/argus-env";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
      activeOptions={{ exact: false }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function EnvBadge({ env }: { env: ArgusEnvKey }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        env === "prod"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {env}
    </span>
  );
}

function EnvToggle() {
  const { env, setEnv } = useArgusEnv();
  return (
    <div className="inline-flex items-center gap-2 rounded-md border bg-card p-1 shadow-sm">
      <button
        onClick={() => setEnv("demo")}
        className={cn(
          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
          env === "demo" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Demo
      </button>
      <button
        onClick={() => setEnv("prod")}
        className={cn(
          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
          env === "prod" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Produção
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { env } = useArgusEnv();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Reset queries when env changes so we don't show stale data from the other env
  useEffect(() => {
    queryClient.invalidateQueries();
  }, [env, queryClient]);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/identities" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Argus ClearID</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">R&amp;M Console</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavItem to="/identities" icon={Users} label="Identities" />
            <NavItem to="/diagnostics" icon={Activity} label="Diagnóstico" />
            <NavItem to="/settings" icon={SettingsIcon} label="Configurações" />
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <EnvBadge env={env} />
            <EnvToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-normal">
                  {email ?? "Conta"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{email ?? "Operador"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
          <NavItem to="/identities" icon={Users} label="Identities" />
          <NavItem to="/diagnostics" icon={Activity} label="Diagnóstico" />
          <NavItem to="/settings" icon={SettingsIcon} label="Configurações" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-route={pathname}>
        {children}
      </main>
    </div>
  );
}