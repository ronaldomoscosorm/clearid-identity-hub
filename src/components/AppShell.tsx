import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Shield, Activity, Settings as SettingsIcon, Users, Palette, ShieldCheck, Check, ChevronDown, Globe } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { argusApi, setDefaultSiteId, useDefaultSiteId } from "@/lib/argus-client";
import { useArgusConfig } from "@/lib/argus-env";
import { useBranding, useApplyBranding } from "@/lib/branding";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PoweredBy } from "@/components/PoweredBy";
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

function EnvBadge({ env }: { env: string }) {
  const isProd = env.toLowerCase() === "prod" || env.toLowerCase() === "production";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        isProd
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {env}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const config = useArgusConfig();
  const envQuery = useQuery({
    queryKey: ["backend-env", config.baseUrl],
    queryFn: argusApi.diagnostics,
    refetchInterval: 60_000,
    retry: false,
  });
  const env = envQuery.data?.environment ?? "…";
  const siteId = useDefaultSiteId();
  const sitesQuery = useQuery({
    queryKey: ["argus", "sites"],
    queryFn: argusApi.listSites,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const currentSite = sitesQuery.data?.find((s) => s.siteId === siteId);
  const branding = useBranding();
  useApplyBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Invalidate page-level queries, but keep shell-owned queries (sites
  // list, env/diagnostics) untouched so the top menu doesn't flicker
  // alongside the page content.
  const invalidatePageQueries = () => {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k0 = q.queryKey?.[0];
        const k1 = q.queryKey?.[1];
        if (k0 === "backend-env") return false;
        if (k0 === "argus" && k1 === "sites") return false;
        return true;
      },
    });
  };

  useEffect(() => {
    invalidatePageQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.baseUrl]);

  useEffect(() => {
    invalidatePageQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

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
            {branding.clientLogo ? (
              <img
                src={branding.clientLogo}
                alt={branding.clientName || "Logo"}
                className="h-8 w-8 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Shield className="h-4 w-4" />
              </div>
            )}
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Argus ClearID</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {branding.clientName || "R&M Console"}
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavItem to="/identities" icon={Users} label="Identities" />
            <NavItem to="/regras" icon={ShieldCheck} label="Regras" />
            <NavItem to="/diagnostics" icon={Activity} label="Diagnóstico" />
            <NavItem to="/settings" icon={SettingsIcon} label="Configurações" />
            <NavItem to="/branding" icon={Palette} label="Identidade" />
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden h-8 gap-1.5 font-normal sm:inline-flex"
                  title="Site padrão"
                  disabled={!sitesQuery.data?.length}
                >
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[180px] truncate text-xs">
                    {currentSite?.name ?? siteId ?? "Selecionar site"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuLabel>Site padrão</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sitesQuery.data?.length ? (
                  [...sitesQuery.data]
                    .sort((a, b) =>
                      (a.name ?? a.siteId).localeCompare(b.name ?? b.siteId, "pt-BR", { sensitivity: "base" }),
                    )
                    .map((s) => {
                    const active = s.siteId === siteId;
                    return (
                      <DropdownMenuItem
                        key={s.siteId}
                        onClick={() => setDefaultSiteId(s.siteId)}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{s.name ?? s.siteId}</span>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <DropdownMenuItem disabled>Nenhum site disponível</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <EnvBadge env={env} />
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
          <NavItem to="/regras" icon={ShieldCheck} label="Regras" />
          <NavItem to="/diagnostics" icon={Activity} label="Diagnóstico" />
          <NavItem to="/settings" icon={SettingsIcon} label="Configurações" />
          <NavItem to="/branding" icon={Palette} label="Identidade" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-route={pathname}>
        {children}
      </main>

      <footer className="border-t bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <PoweredBy />
        </div>
      </footer>
    </div>
  );
}