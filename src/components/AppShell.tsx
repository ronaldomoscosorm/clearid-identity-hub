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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const NAV_ITEMS = [
  { to: "/identities", icon: Users, label: "Identities" },
  { to: "/regras", icon: ShieldCheck, label: "Regras" },
  { to: "/diagnostics", icon: Activity, label: "Diagnóstico" },
  { to: "/settings", icon: SettingsIcon, label: "Configurações" },
  { to: "/branding", icon: Palette, label: "Identidade" },
] as const;

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
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Link to="/identities" className="flex items-center gap-2 px-2 py-1.5">
              {branding.clientLogo ? (
                <img
                  src={branding.clientLogo}
                  alt={branding.clientName || "Logo"}
                  className="h-8 w-8 shrink-0 rounded-md object-contain"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Shield className="h-4 w-4" />
                </div>
              )}
              <div className="leading-tight group-data-[collapsible=icon]:hidden">
                <div className="text-sm font-semibold text-foreground">Argus ClearID</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {branding.clientName || "R&M Console"}
                </div>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 group-data-[collapsible=icon]:hidden">
              <PoweredBy />
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 font-normal"
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
          </header>

          <main className="flex-1 px-4 py-8 sm:px-6" data-route={pathname}>
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}