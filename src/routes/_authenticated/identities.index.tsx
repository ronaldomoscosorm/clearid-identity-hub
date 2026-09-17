import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { mirrorIdentities } from "@/lib/supabase-mirror";
import { Plus, RefreshCw, Search, MoreHorizontal, Eye, Camera, Users, UserCheck, UserX, ArrowRight, Paperclip, ExternalLink } from "lucide-react";
import { argusApi, useDefaultSiteId, useActiveProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";
import { useCurrentAttachments, signedUrlFor } from "@/lib/attachments";
import { pickLang } from "@/lib/custom-fields";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentityThumb } from "@/components/IdentityThumb";
import { IdentityPictureDialog } from "@/components/IdentityPictureDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/identities/")({
  head: () => ({ meta: [{ title: "Pessoas — Argus ClearID" }] }),
  component: IdentitiesList,
});

// Painel base do console R&M.
const panel = "rounded-2xl border border-[var(--rm-line)] bg-[var(--rm-panel)]";
const fullName = (it: { firstName?: string | null; lastName?: string | null; identityId: string }) =>
  `${it.firstName ?? ""} ${it.lastName ?? ""}`.trim() || it.identityId;

// Valor do seletor de site que representa "todos os sites".
const ALL_SITES = "__all__";

type AppliedFilters = {
  firstName: string;
  email: string;
  company: string;
  status: string;
  /** Tipo do trabalhador EXATO (worker_types.id) — filtrado localmente, não no ClearID. */
  workerTypeId: string;
  allSites: boolean;
  siteId?: string;
};

// Estado da pesquisa preservado entre navegações (ex.: ficha → voltar).
// Em nível de módulo: sobrevive à desmontagem do componente na navegação SPA.
type PersistedSearch = {
  fFirstName: string;
  fEmail: string;
  fCompany: string;
  fStatus: string;
  fWorkerType: string;
  fSite: string;
  hasSearched: boolean;
  applied: AppliedFilters;
  sel: string | null;
};
let persistedSearch: PersistedSearch | null = null;

function IdentitiesList() {
  const { t, lang } = useT();
  const siteId = useDefaultSiteId();
  const [pictureFor, setPictureFor] = useState<{ id: string; name: string } | null>(null);
  const [sel, setSel] = useState<string | null>(persistedSearch?.sel ?? null);
  // Campos do formulário (não disparam busca automaticamente)
  const [fFirstName, setFFirstName] = useState(persistedSearch?.fFirstName ?? "");
  const [fEmail, setFEmail] = useState(persistedSearch?.fEmail ?? "");
  const [fCompany, setFCompany] = useState(persistedSearch?.fCompany ?? "");
  const [fStatus, setFStatus] = useState<string>(persistedSearch?.fStatus ?? "all");
  const [fWorkerType, setFWorkerType] = useState<string>(persistedSearch?.fWorkerType ?? "all");
  // Site do filtro: começa em "Todos os sites" por padrão (não segue mais o site
  // da topbar). Uma pesquisa restaurada mantém o site que estava.
  const [fSite, setFSite] = useState<string>(persistedSearch?.fSite ?? ALL_SITES);

  // Sites do filtro vêm do CorporateData (mesma fonte da topbar), não do
  // /api/sites do ClearID (que retorna vazio para este usuário). Resolve o
  // cliente ativo (code do profile) → clienteId e lista os sites de escopo
  // ClearID, mapeando externalId → siteId como o resto do app espera.
  const activeProfile = useActiveProfile();
  const clientesQuery = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeCliente = clientesQuery.data?.find(
    (c) => c.code.toLowerCase() === activeProfile.toLowerCase(),
  );
  const sitesQuery = useQuery({
    queryKey: ["corporatedata", "sites", activeCliente?.id ?? null],
    queryFn: async () => {
      if (!activeCliente) return [];
      const list = await corporateData.listClearIdSites(activeCliente.id);
      return list.map((s) => ({ siteId: s.externalId, name: s.name }));
    },
    enabled: !!activeCliente,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const sites = (sitesQuery.data ?? [])
    .slice()
    .sort((a, b) => {
      // Site padrão (o da topbar) sempre em primeiro; o resto alfabético.
      if (a.siteId === siteId && b.siteId !== siteId) return -1;
      if (b.siteId === siteId && a.siteId !== siteId) return 1;
      return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
    });

  // Tipos de trabalhador cadastrados (mesma fonte do menu/Nova identity).
  // O filtro lista os tipos existentes por nome; a busca ClearID recebe o
  // código Argus (Colaborador/Terceiros) mapeado a partir do tipo escolhido.
  const workerTypesQuery = useQuery({
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
  const workerTypes = workerTypesQuery.data ?? [];

  // Filtros efetivamente aplicados — só mudam ao clicar em Pesquisar
  const [hasSearched, setHasSearched] = useState(persistedSearch?.hasSearched ?? false);
  const [applied, setApplied] = useState<AppliedFilters>(
    persistedSearch?.applied ?? {
      firstName: "",
      email: "",
      company: "",
      status: "all",
      workerTypeId: "all",
      allSites: false,
    },
  );

  // Preserva a pesquisa atual para restaurar ao voltar da ficha.
  useEffect(() => {
    persistedSearch = {
      fFirstName,
      fEmail,
      fCompany,
      fStatus,
      fWorkerType,
      fSite,
      hasSearched,
      applied,
      sel,
    };
  }, [fFirstName, fEmail, fCompany, fStatus, fWorkerType, fSite, hasSearched, applied, sel]);

  const query = useQuery({
    queryKey: ["identities", applied],
    queryFn: () =>
      argusApi.listIdentities({
        firstName: applied.firstName || undefined,
        email: applied.email || undefined,
        company: applied.company || undefined,
        status: applied.status === "all" ? undefined : applied.status,
        // Tipo do trabalhador NÃO é conceito do ClearID — filtrado localmente abaixo.
        // Com filtro de tipo ativo, buscamos um pool maior para o cruzamento local.
        take: applied.workerTypeId !== "all" ? 200 : undefined,
        allSites: applied.allSites,
        siteId: applied.siteId || undefined,
      }),
    enabled: hasSearched,
    retry: false,
  });

  const rawItems = query.data?.items ?? [];

  // Espelha o retorno do ClearID no Supabase antes de cruzar com o tipo local.
  // Best-effort: falha no espelhamento da LISTAGEM não bloqueia a UI (o save
  // atomic da identity, sim, exige sucesso — ver identity-atomic.ts).
  useEffect(() => {
    if (rawItems.length)
      mirrorIdentities(rawItems).catch((err) =>
        console.error("[mirror] falha ao espelhar listagem:", err),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  // Filtro por tipo do trabalhador: cruza os ids retornados com o worker_type_id
  // gravado localmente (o ClearID não guarda o tipo específico).
  const rawIdsKey = rawItems.map((i) => i.identityId).sort().join(",");
  const filterByType = applied.workerTypeId !== "all";
  const localTypesQuery = useQuery({
    queryKey: ["identities-local-worker-type", rawIdsKey],
    enabled: filterByType && rawItems.length > 0,
    queryFn: async () => {
      const ids = rawItems.map((i) => i.identityId);
      const { data, error } = await supabase
        .from("identities")
        .select("identity_id, worker_type_id")
        .in("identity_id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  // Sites do cliente logado (para restringir "Todos os sites").
  const clientSiteIds = useMemo(() => new Set(sites.map((s) => s.siteId)), [sites]);
  // Colaborador é o tipo padrão: pessoas SEM worker_type_id contam como Colaborador.
  const colaboradorId = useMemo(
    () => workerTypes.find((w) => w.argus_worker_type_code === "Colaborador")?.id ?? null,
    [workerTypes],
  );

  const items = useMemo(() => {
    // "Todos os sites" = apenas os sites permitidos ao cliente logado. O ClearID
    // sem site retorna o tenant inteiro; filtramos pelo site do cadastro (o hit
    // traz `siteId` no topo). Só aplica quando os sites do cliente já carregaram.
    let base = rawItems;
    if (applied.allSites && clientSiteIds.size > 0) {
      // Restringe aos sites do cliente. Tolerante: mantém quem não tem site
      // identificável no retorno (o hit nem sempre traz o site). Fail-open: se
      // o filtro zerar tudo (site do hit em formato diferente do externalId),
      // mantém a lista original para não quebrar a busca.
      const filtered = base.filter((i) => {
        const s = (i as { siteId?: string }).siteId;
        return !s || clientSiteIds.has(s);
      });
      base = filtered.length > 0 ? filtered : base;
    }
    if (!filterByType) return base;
    const localById = new Map(
      (localTypesQuery.data ?? []).map((r) => [r.identity_id, r.worker_type_id]),
    );
    const isColaboradorFilter = applied.workerTypeId === colaboradorId;
    return base.filter((i) => {
      const wt = localById.get(i.identityId); // undefined (sem linha) ou null (sem tipo)
      if (wt === applied.workerTypeId) return true;
      // Sem tipo definido → default Colaborador.
      if (isColaboradorFilter && wt == null) return true;
      return false;
    });
  }, [
    rawItems,
    applied.allSites,
    clientSiteIds,
    filterByType,
    localTypesQuery.data,
    applied.workerTypeId,
    colaboradorId,
  ]);

  // Aguardando o cruzamento local quando há filtro de tipo ativo.
  const typeFilterLoading = filterByType && rawItems.length > 0 && localTypesQuery.isLoading;

  const isActive = (s: unknown) => String(s ?? "").toLowerCase() === "active";
  const activeCount = items.filter((i) => isActive(i.status)).length;
  // Com filtro local, o total exibível é a contagem já filtrada.
  const displayTotal = filterByType ? items.length : query.data?.total ?? items.length;

  // Seleciona a primeira identidade visível (após o filtro local).
  useEffect(() => {
    if (items.length) {
      setSel((prev) => (prev && items.some((i) => i.identityId === prev) ? prev : items[0].identityId));
    } else {
      setSel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawIdsKey, items.length]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allSites = fSite === ALL_SITES;
    setHasSearched(true);
    setApplied({
      firstName: fFirstName.trim(),
      email: fEmail.trim(),
      company: fCompany.trim(),
      status: fStatus,
      workerTypeId: fWorkerType,
      allSites,
      siteId: allSites ? undefined : fSite || undefined,
    });
  };

  const onClear = () => {
    setFFirstName("");
    setFEmail("");
    setFCompany("");
    setFStatus("all");
    setFWorkerType("all");
    setFSite(siteId ?? "");
    setHasSearched(false);
    setApplied({ firstName: "", email: "", company: "", status: "all", workerTypeId: "all", allSites: false });
    persistedSearch = null;
  };

  // Trocar qualquer dropdown zera o resultado atual — exige nova busca.
  const resetResults = () => {
    setHasSearched(false);
    setSel(null);
  };

  const selected = items.find((i) => i.identityId === sel) ?? null;

  return (
    <div className="rm space-y-5 text-[var(--rm-ink)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--rm-ink)]">{t("identities.title")}</h1>
          <p className="mt-1 text-sm text-[var(--rm-dim)]">{t("identities.subtitle")}</p>
        </div>
        <Button
          asChild
          className="rounded-full font-semibold text-white hover:brightness-105"
          style={{ background: "var(--rm-brand)", boxShadow: "0 8px 18px -7px rgba(253,83,0,.5)" }}
        >
          <Link to="/identities/new">
            <Plus className="mr-1 h-4 w-4" /> {t("identities.newButton")}
          </Link>
        </Button>
      </div>

      {/* Métricas (após buscar) */}
      {hasSearched && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={<Users className="h-5 w-5" />} tone="brand" value={displayTotal} label={t("identities.metric.results")} />
          <Metric icon={<UserCheck className="h-5 w-5" />} tone="active" value={activeCount} label={t("identities.metric.active")} />
          <Metric icon={<UserX className="h-5 w-5" />} tone="inactive" value={items.length - activeCount} label={t("identities.metric.inactive")} />
        </div>
      )}

      {/* Filtros */}
      <form onSubmit={onSubmit} className={cn(panel, "space-y-4 p-4")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("common.name")}>
            <Input value={fFirstName} onChange={(e) => setFFirstName(e.target.value)} placeholder={t("identities.filter.namePlaceholder")} />
          </Field>
          <Field label={t("common.email")}>
            <Input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder={t("identities.filter.emailPlaceholder")} />
          </Field>
          <Field label={t("identities.filter.company")}>
            <Input value={fCompany} onChange={(e) => setFCompany(e.target.value)} placeholder={t("identities.filter.company")} />
          </Field>
          <Field label={t("common.status")}>
            <Select value={fStatus} onValueChange={(v) => { setFStatus(v); resetResults(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">{t("identities.status.active")}</SelectItem>
                <SelectItem value="Inactive">{t("identities.status.inactive")}</SelectItem>
                <SelectItem value="all">{t("identities.status.all")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("identities.filter.workerType")}>
            <Select value={fWorkerType} onValueChange={(v) => { setFWorkerType(v); resetResults(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("identities.workerType.all")}</SelectItem>
                {workerTypes.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {pickLang(w.name_i18n, lang) || w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("identities.filter.site")}>
            <Select value={fSite} onValueChange={(v) => { setFSite(v); resetResults(); }}>
              <SelectTrigger><SelectValue placeholder={t("identities.filter.sitePlaceholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SITES}>{t("identities.filter.allSites")}</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClear} disabled={query.isFetching} className="text-[var(--rm-dim)]">
            {t("identities.filter.clear")}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => query.refetch()} disabled={query.isFetching} title={t("identities.filter.reload")}>
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button type="submit" disabled={query.isFetching} className="rounded-full font-semibold text-white hover:brightness-105" style={{ background: "var(--rm-brand)" }}>
            <Search className="mr-1 h-4 w-4" /> {t("common.search")}
          </Button>
        </div>
      </form>

      {/* Roster + Inspector */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className={cn(panel, "overflow-hidden")}>
          {/* cabeçalho de colunas */}
          <div className="grid grid-cols-[12px_40px_1fr_110px_64px_36px] items-center gap-3 border-b border-[var(--rm-line)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--rm-faint)]">
            <div></div><div></div><div>{t("identities.col.identity")}</div><div>{t("common.status")}</div><div className="text-right">{t("identities.col.relevance")}</div><div></div>
          </div>

          {!hasSearched ? (
            <EmptyState>
              {t("identities.emptyPrompt.before")}{" "}
              <span className="font-semibold text-[var(--rm-brand-ink)]">{t("common.search")}</span>{" "}
              {t("identities.emptyPrompt.after")}
            </EmptyState>
          ) : query.isLoading || query.isFetching || typeFilterLoading ? (
            <div className="divide-y divide-[var(--rm-line-soft)]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-4 rounded-full" /><Skeleton className="h-9 w-9 rounded-lg" /><Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : query.isError ? (
            <EmptyState tone="error">{(query.error as Error).message}</EmptyState>
          ) : !items.length ? (
            <EmptyState>{t("identities.emptyResult")}</EmptyState>
          ) : (
            <div>
              {displayTotal > items.length && (
                <div className="border-b border-[var(--rm-line-soft)] bg-[var(--rm-panel-2)] px-4 py-2 text-xs text-[var(--rm-dim)]">
                  {t("identities.showingFirst", {
                    shown: items.length,
                    total: displayTotal,
                  })}
                </div>
              )}
              {items.map((it) => {
                const active = isActive(it.status);
                const on = it.identityId === sel;
                return (
                  <div
                    key={it.identityId}
                    onClick={() => setSel(it.identityId)}
                    className={cn(
                      "grid cursor-pointer grid-cols-[12px_40px_1fr_110px_64px_36px] items-center gap-3 border-b border-[var(--rm-line-soft)] px-4 py-3 transition-colors",
                      on ? "bg-[color-mix(in_srgb,var(--rm-brand)_9%,transparent)]" : "hover:bg-[var(--rm-panel-2)]",
                    )}
                    style={on ? { boxShadow: "inset 2px 0 0 var(--rm-brand)" } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 justify-self-center rounded-full"
                      style={active ? { background: "var(--rm-active)", boxShadow: "0 0 8px var(--rm-active)" } : { background: "var(--rm-inactive)" }}
                    />
                    <IdentityThumb identityId={it.identityId} />
                    <div className="min-w-0">
                      <Link
                        to="/identities/$id"
                        params={{ id: it.identityId }}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate text-sm font-semibold text-[var(--rm-ink)] hover:text-[var(--rm-brand-ink)] hover:underline"
                      >
                        {fullName(it)}
                      </Link>
                      <div className="truncate text-xs text-[var(--rm-dim)] tnum">
                        <span className="text-[var(--rm-faint)]">{it.identityId.slice(0, 8)}</span> · {it.email ?? "—"}
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold tracking-wide" style={{ color: active ? "var(--rm-active-ink)" : "var(--rm-inactive-ink)" }}>
                      {active ? "● " + t("identities.status.active") : "○ " + (String(it.status ?? "") || "—")}
                    </div>
                    <div className="text-right text-xs text-[var(--rm-dim)] tnum">
                      {typeof it.score === "number" ? it.score.toFixed(2) : "—"}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--rm-faint)]">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">{t("common.actions")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/identities/$id" params={{ id: it.identityId }}>
                              <Eye className="mr-2 h-4 w-4" /> {t("identities.action.view")}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPictureFor({ id: it.identityId, name: fullName(it) })}>
                            <Camera className="mr-2 h-4 w-4" /> {t("identities.action.updatePhoto")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inspector */}
        <aside className={cn(panel, "hidden self-start p-5 lg:block")}>
          {selected ? (
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rm-faint)]">{t("identities.inspector.title")}</div>
              <div className="flex items-center gap-3">
                <div className="[&_span]:!h-16 [&_span]:!w-16 [&_img]:!h-16 [&_img]:!w-16">
                  <IdentityThumb identityId={selected.identityId} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-[var(--rm-ink)]">{fullName(selected)}</div>
                  <div className="truncate text-xs text-[var(--rm-dim)] tnum">{selected.identityId.slice(0, 13)}</div>
                </div>
              </div>
              <dl className="space-y-2.5 text-sm">
                <InspRow k={t("common.status")}>
                  <span style={{ color: isActive(selected.status) ? "var(--rm-active-ink)" : "var(--rm-inactive-ink)" }} className="font-semibold">
                    {isActive(selected.status) ? t("identities.status.active") : String(selected.status ?? "") || "—"}
                  </span>
                </InspRow>
                <InspRow k={t("common.email")}><span className="text-[var(--rm-ink)]">{selected.email ?? "—"}</span></InspRow>
                <InspRow k={t("identities.col.relevance")}><span className="text-[var(--rm-ink)] tnum">{typeof selected.score === "number" ? selected.score.toFixed(2) : "—"}</span></InspRow>
              </dl>
              <InspectorAttachments identityId={selected.identityId} />
              <div className="flex gap-2 pt-1">
                <Button asChild className="flex-1 rounded-lg text-white hover:brightness-105" style={{ background: "var(--rm-brand)" }}>
                  <Link to="/identities/$id" params={{ id: selected.identityId }}>
                    {t("identities.inspector.open")} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="icon" title={t("identities.action.updatePhoto")} onClick={() => setPictureFor({ id: selected.identityId, name: fullName(selected) })}>
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-[var(--rm-faint)]">{t("identities.inspector.empty")}</div>
          )}
        </aside>
      </div>

      {pictureFor && (
        <IdentityPictureDialog
          identityId={pictureFor.id}
          identityName={pictureFor.name}
          open={!!pictureFor}
          onOpenChange={(o) => !o && setPictureFor(null)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[var(--rm-dim)]">{label}</Label>
      {children}
    </div>
  );
}

// Anexos (comprovantes) da pessoa selecionada — visualização direto na pesquisa.
function InspectorAttachments({ identityId }: { identityId: string }) {
  const { t } = useT();
  const q = useCurrentAttachments(identityId);
  const items = q.data ?? [];
  if (!items.length) return null;
  const open = async (path: string) => {
    try {
      window.open(await signedUrlFor(path), "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-1.5 border-t border-[var(--rm-line-soft)] pt-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rm-faint)]">
        {t("identities.inspector.attachments")}
      </div>
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => open(a.storage_path)}
          title={t("attachment.download")}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--rm-line-soft)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--rm-panel-2)]"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--rm-dim)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-[var(--rm-ink)]">
              {pickLang(a.definition?.display_name) || a.definition?.custom_field_name || a.file_name}
            </span>
            <span className="block truncate text-[11px] text-[var(--rm-faint)]">{a.file_name}</span>
          </span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--rm-dim)]" />
        </button>
      ))}
    </div>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: "brand" | "active" | "inactive" }) {
  const tint =
    tone === "brand"
      ? { background: "color-mix(in srgb, var(--rm-brand) 12%, transparent)", color: "var(--rm-brand-ink)" }
      : tone === "active"
        ? { background: "color-mix(in srgb, var(--rm-active) 16%, transparent)", color: "var(--rm-active-ink)" }
        : { background: "color-mix(in srgb, var(--rm-inactive) 14%, transparent)", color: "var(--rm-inactive-ink)" };
  return (
    <div className={cn(panel, "flex items-center gap-3.5 p-4")}>
      <div className="grid h-11 w-11 place-items-center rounded-xl" style={tint}>{icon}</div>
      <div>
        <div className="text-[22px] font-bold leading-none tracking-tight text-[var(--rm-ink)] tnum">{value.toLocaleString("pt-BR")}</div>
        <div className="mt-1.5 text-[13px] text-[var(--rm-dim)]">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className={cn("px-6 py-12 text-center text-sm", tone === "error" ? "text-destructive" : "text-[var(--rm-faint)]")}>
      {children}
    </div>
  );
}

function InspRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--rm-line)] pb-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--rm-faint)]">{k}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
