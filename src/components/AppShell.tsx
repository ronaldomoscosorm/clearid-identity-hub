import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Shield, Activity, Settings as SettingsIcon, Settings2, Users, Palette, ShieldCheck, Check, ChevronDown, Globe, ListChecks, RefreshCw, Hourglass, Building2, SlidersHorizontal, Tag, Camera, Cog, Database, Wrench, ClipboardList, DoorOpen, LayoutGrid, BriefcaseBusiness, Upload } from "lucide-react";
import { getTheme, applyTheme } from "@/lib/theme";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  argusApi,
  setSessionSiteId,
  useDefaultSiteId,
  useSystemObjectId,
  useActiveProfile,
  setSessionProfile,
  CLEARID_PROFILES,
} from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { useArgusConfig } from "@/lib/argus-env";
import { useBranding, useApplyBranding } from "@/lib/branding";
import { useT, LANGS } from "@/lib/i18n";
import { FlagIcon } from "@/components/FlagIcon";
import { Button } from "@/components/ui/button";
import { PoweredBy } from "@/components/PoweredBy";
import { CurrentUserBadge } from "@/components/CurrentUserBadge";
import { useCurrentUser } from "@/lib/current-user";
import { useMenuTree, type MenuNode } from "@/lib/menu-tree";
import { setActiveSite, useEnsureActiveSite } from "@/lib/active-site";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { pickLang } from "@/lib/custom-fields";
import { useQueryClient } from "@tanstack/react-query";

type NavItem = { to: string; icon: typeof Users; key: string; dynamic?: "workerTypes" };
type NavGroupDef = { key: string; icon: typeof Users; items: NavItem[] };
type NavEntry = ({ kind: "item" } & NavItem) | ({ kind: "group" } & NavGroupDef);

// Menu (ordem exata; item = link simples, group = colapsável).
const NAV: NavEntry[] = [
  {
    kind: "group",
    key: "nav.cadastro",
    icon: ClipboardList,
    items: [
      { to: "/identities", icon: Users, key: "nav.identities", dynamic: "workerTypes" },
      { to: "/visitas", icon: DoorOpen, key: "nav.visitas" },
      { to: "/regras", icon: ShieldCheck, key: "nav.regras" },
    ],
  },
  {
    kind: "group",
    key: "nav.utilities",
    icon: Wrench,
    items: [
      { to: "/campanhas-foto", icon: Camera, key: "nav.campanhas-foto" },
      { to: "/importar", icon: Upload, key: "nav.importar" },
    ],
  },
  {
    kind: "group",
    key: "nav.tables",
    icon: Database,
    items: [
      { to: "/empresas", icon: Building2, key: "nav.empresas" },
      { to: "/tipos-trabalhador", icon: BriefcaseBusiness, key: "nav.tipos-trabalhador" },
    ],
  },
  {
    kind: "group",
    key: "nav.configGroup",
    icon: Settings2,
    items: [
      { to: "/campos-personalizados", icon: ListChecks, key: "nav.campos-personalizados" },
      { to: "/campos-do-site", icon: SlidersHorizontal, key: "nav.campos-do-site" },
      { to: "/apelidos", icon: Tag, key: "nav.apelidos" },
      { to: "/layout-formulario", icon: LayoutGrid, key: "nav.layout-formulario" },
    ],
  },
  {
    kind: "group",
    key: "nav.properties",
    icon: Cog,
    items: [
      { to: "/diagnostics", icon: Activity, key: "nav.diagnostics" },
      { to: "/settings", icon: SettingsIcon, key: "nav.settings" },
      { to: "/branding", icon: Palette, key: "nav.branding" },
    ],
  },
];

/** Normaliza a key do NAV (ex.: "nav.identities") para a key de menu do backend ("identities"). */
const menuKeyOf = (navKey: string) => navKey.replace(/^nav\./, "");

/** Coleta todas as keys de menu de uma árvore vinda do backend. */
function collectMenuKeys(tree: MenuNode[], acc: Set<string> = new Set()): Set<string> {
  for (const node of tree) {
    acc.add(node.key);
    if (node.children?.length) collectMenuKeys(node.children, acc);
  }
  return acc;
}

/**
 * Filtra o NAV pelas keys permitidas ao usuário (vindas do useMenuTree). `null` =
 * sem restrição (fallback dev/sem backend) → mostra tudo. Um grupo aparece se ele
 * próprio ou algum item filho estiver permitido.
 */
function filterNav(nav: NavEntry[], allowed: Set<string> | null): NavEntry[] {
  if (!allowed) return nav;
  const out: NavEntry[] = [];
  for (const entry of nav) {
    if (entry.kind === "item") {
      if (allowed.has(menuKeyOf(entry.key))) out.push(entry);
      continue;
    }
    const items = entry.items.filter((it) => allowed.has(menuKeyOf(it.key)));
    if (items.length > 0 || allowed.has(menuKeyOf(entry.key))) {
      out.push({ ...entry, items });
    }
  }
  return out;
}

function NavGroup({
  group,
  pathname,
  t,
}: {
  group: NavGroupDef;
  pathname: string;
  t: (key: string) => string;
}) {
  const active = group.items.some((i) => pathname.startsWith(i.to));
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/nav">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={t(group.key)}>
            <group.icon className="h-4 w-4" />
            <span>{t(group.key)}</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/nav:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.items.map((item) =>
              item.dynamic === "workerTypes" ? (
                <IdentitiesSubNav key={item.to} item={item} pathname={pathname} />
              ) : (
                <SidebarMenuSubItem key={item.to}>
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith(item.to)}>
                    <Link to={item.to}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.key)}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ),
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

// Submenu de "Pessoas": link para a lista + um item por tipo de trabalhador,
// cada um abrindo o novo cadastro já com o tipo definido.
function IdentitiesSubNav({ item, pathname }: { item: NavItem; pathname: string }) {
  const { t, lang } = useT();
  const activeProfile = useActiveProfile();
  const wtQuery = useQuery({
    queryKey: ["worker-types", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .eq("is_active", true)
        .eq("profile", activeProfile)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const workerTypes = wtQuery.data ?? [];
  const onSection = pathname.startsWith(item.to);
  const [open, setOpen] = useState(onSection);
  useEffect(() => {
    if (onSection) setOpen(true);
  }, [onSection]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/sub">
      <SidebarMenuSubItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuSubButton isActive={onSection} className="cursor-pointer">
            <item.icon className="h-4 w-4" />
            <span>{t(item.key)}</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/sub:rotate-180" />
          </SidebarMenuSubButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={pathname === item.to}>
                <Link to={item.to}>
                  <span>{t("nav.identitiesAll")}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            {workerTypes.map((w) => (
              <SidebarMenuSubItem key={w.id}>
                <SidebarMenuSubButton asChild>
                  <Link to="/identities/new" search={{ type: w.id }}>
                    <span>{pickLang(w.name_i18n, lang) || w.name}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
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
  const systemObjectId = useSystemObjectId();
  const activeProfile = useActiveProfile();
  const sitesQuery = useQuery({
    queryKey: ["argus", "sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const currentSite = sitesQuery.data?.find((s) => s.siteId === siteId);

  // --- Escopo pelo usuário logado (Portal Argus). Fallback gracioso: quando o
  // backend não retorna dados (ex.: dev/CORS), não há restrição. ---
  const { data: currentUser } = useCurrentUser();
  const { data: menuData } = useMenuTree();
  const userSites = currentUser?.sites ?? [];
  const restrictByUser = userSites.length > 0;
  useEnsureActiveSite(restrictByUser ? userSites : undefined);

  // Clientes exibidos: só os que o usuário tem grant (prefixo `cliente:`).
  const allowedClientCodes = new Set(
    userSites.map((s) => (s.split(":")[0] ?? "").toLowerCase()),
  );
  const visibleProfiles = restrictByUser
    ? CLEARID_PROFILES.filter((p) => allowedClientCodes.has(p.code.toLowerCase()))
    : CLEARID_PROFILES;

  // Sites exibidos: só os do usuário no cliente ativo (nome após `cliente:`).
  const allowedSiteNames = new Set(
    userSites
      .filter((s) => (s.split(":")[0] ?? "").toLowerCase() === activeProfile.toLowerCase())
      .map((s) => s.split(":").slice(1).join(":").toLowerCase()),
  );
  const visibleSites = (sitesQuery.data ?? []).filter(
    (s) => !restrictByUser || allowedSiteNames.has((s.name ?? "").toLowerCase()),
  );

  // Menus exibidos: filtrados pelas keys permitidas ao usuário (do backend).
  const allowedMenuKeys = menuData ? collectMenuKeys(menuData.tree) : null;
  const visibleNav = filterNav(NAV, allowedMenuKeys);

  // Se o cliente ATIVO não faz parte do grant do usuário, troca para o primeiro
  // permitido (evita operar num cliente sem acesso).
  const grantKey = userSites.join(",");
  useEffect(() => {
    if (!restrictByUser) return;
    if (allowedClientCodes.has(activeProfile.toLowerCase())) return;
    const first = visibleProfiles[0];
    if (first && first.code !== activeProfile) {
      setSessionProfile(first.code);
      setSessionSiteId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantKey, activeProfile, restrictByUser]);

  const branding = useBranding();
  useApplyBranding();
  const { t, lang, setLang } = useT();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Troca o perfil (conta ClearID) SÓ na sessão — não altera o padrão de
  // Configurações. Como os dados (sites, campos, pessoas…) são por conta, reseta
  // o site da sessão e limpa os caches para não misturar clientes.
  const changeProfile = (code: string) => {
    if (code === activeProfile) return;
    setSessionProfile(code);
    setSessionSiteId(null);
    queryClient.clear();
  };
  // Aplica o tema salvo (o controle fica na página Identidade).
  useEffect(() => {
    applyTheme(getTheme());
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Carrega o catálogo de campos personalizados (Argus) e espelha no Supabase
  // ao abrir qualquer página, para que fique disponível em todo o app.
  const customFieldsQuery = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const defs = customFieldsQuery.data;
    if (defs?.length) void mirrorCustomFieldDefs(defs.filter((d) => !d.isDeleted));
  }, [customFieldsQuery.data]);

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

  useEffect(() => {
    invalidatePageQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemObjectId]);

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
                  {branding.clientName || t("shell.console")}
                </div>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleNav.map((entry) =>
                    entry.kind === "item" ? (
                      <SidebarMenuItem key={entry.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname.startsWith(entry.to)}
                          tooltip={t(entry.key)}
                        >
                          <Link to={entry.to}>
                            <entry.icon className="h-4 w-4" />
                            <span>{t(entry.key)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ) : (
                      <NavGroup key={entry.key} group={entry} pathname={pathname} t={t} />
                    ),
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 group-data-[collapsible=icon]:hidden">
              <CurrentUserBadge />
              <PoweredBy />
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className={cn("h-8 gap-1.5 font-normal", refreshing && "cursor-wait")}
                title={t("shell.refreshTitle")}
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await queryClient.invalidateQueries();
                    toast.success(t("shell.refreshed"));
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                {refreshing ? (
                  <Hourglass className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-xs">{t("shell.refresh")}</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 font-normal"
                    title={t("shell.language")}
                  >
                    <FlagIcon lang={lang} />
                    <span className="text-xs">
                      {LANGS.find((l) => l.code === lang)?.short ?? lang}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>{t("shell.language")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {LANGS.map((l) => (
                    <DropdownMenuItem
                      key={l.code}
                      onClick={() => setLang(l.code)}
                      className="flex items-center gap-2"
                    >
                      <FlagIcon lang={l.code} />
                      <span className="flex-1">{l.label}</span>
                      {l.code === lang && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 font-normal"
                    title={t("shell.profile")}
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[160px] truncate text-xs">
                      {t("shell.profile")}: {activeProfile}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>{t("shell.profile")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {visibleProfiles.length ? (
                    visibleProfiles.map((p) => (
                      <DropdownMenuItem
                        key={p.code}
                        onClick={() => changeProfile(p.code)}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{p.label}</span>
                        {p.code === activeProfile && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>{t("shell.noClients")}</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 font-normal"
                    title={t("shell.defaultSite")}
                    disabled={!visibleSites.length}
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[180px] truncate text-xs">
                      {currentSite?.name ?? siteId ?? t("shell.selectSite")}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                  <DropdownMenuLabel>{t("shell.defaultSite")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {visibleSites.length ? (
                    [...visibleSites]
                      .sort((a, b) =>
                        (a.name ?? a.siteId).localeCompare(b.name ?? b.siteId, "pt-BR", { sensitivity: "base" }),
                      )
                      .map((s) => {
                        const active = s.siteId === siteId;
                        return (
                          <DropdownMenuItem
                            key={s.siteId}
                            onClick={() => {
                              setSessionSiteId(s.siteId);
                              // Mantém o X-Argus-Site (modelo cliente:site) em sincronia.
                              setActiveSite(`${activeProfile}:${s.name ?? s.siteId}`);
                            }}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{s.name ?? s.siteId}</span>
                            {active && <Check className="h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        );
                      })
                  ) : (
                    <DropdownMenuItem disabled>{t("shell.noSites")}</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <EnvBadge env={env} />
            </div>
          </header>

          <main
            className={cn("flex-1 px-4 py-8 sm:px-6", refreshing && "cursor-wait")}
            data-route={pathname}
          >
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}