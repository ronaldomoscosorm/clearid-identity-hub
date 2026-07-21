import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { mirrorIdentities } from "@/lib/supabase-mirror";
import { Plus, RefreshCw, Search, MoreHorizontal, Eye, Camera, Users, UserCheck, UserX, ArrowRight } from "lucide-react";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
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
  workerTypeCode: string;
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
  const { t } = useT();
  const siteId = useDefaultSiteId();
  const [pictureFor, setPictureFor] = useState<{ id: string; name: string } | null>(null);
  const [sel, setSel] = useState<string | null>(persistedSearch?.sel ?? null);
  // Campos do formulário (não disparam busca automaticamente)
  const [fFirstName, setFFirstName] = useState(persistedSearch?.fFirstName ?? "");
  const [fEmail, setFEmail] = useState(persistedSearch?.fEmail ?? "");
  const [fCompany, setFCompany] = useState(persistedSearch?.fCompany ?? "");
  const [fStatus, setFStatus] = useState<string>(persistedSearch?.fStatus ?? "all");
  const [fWorkerType, setFWorkerType] = useState<string>(persistedSearch?.fWorkerType ?? "all");
  // Site do filtro: um siteId específico ou ALL_SITES. Vazio só ocorre antes de o
  // site padrão resolver — uma pesquisa restaurada sempre tem site definido.
  const [fSite, setFSite] = useState<string>(persistedSearch?.fSite ?? "");
  useEffect(() => {
    if (!fSite && siteId) setFSite(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, fSite]);

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = (sitesQuery.data ?? [])
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));

  // Filtros efetivamente aplicados — só mudam ao clicar em Pesquisar
  const [hasSearched, setHasSearched] = useState(persistedSearch?.hasSearched ?? false);
  const [applied, setApplied] = useState<AppliedFilters>(
    persistedSearch?.applied ?? {
      firstName: "",
      email: "",
      company: "",
      status: "all",
      workerTypeCode: "all",
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
        workerTypeCode: applied.workerTypeCode === "all" ? undefined : applied.workerTypeCode,
        allSites: applied.allSites,
        siteId: applied.siteId || undefined,
      }),
    enabled: hasSearched,
    retry: false,
  });

  const items = query.data?.items ?? [];
  const isActive = (s: unknown) => String(s ?? "").toLowerCase() === "active";
  const activeCount = items.filter((i) => isActive(i.status)).length;

  // Espelha as identidades retornadas para o Supabase; seleciona a primeira.
  useEffect(() => {
    if (query.data?.items?.length) {
      void mirrorIdentities(query.data.items);
      setSel((prev) =>
        prev && query.data!.items.some((i) => i.identityId === prev) ? prev : query.data!.items[0].identityId,
      );
    } else {
      setSel(null);
    }
  }, [query.data]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allSites = fSite === ALL_SITES;
    setHasSearched(true);
    setApplied({
      firstName: fFirstName.trim(),
      email: fEmail.trim(),
      company: fCompany.trim(),
      status: fStatus,
      workerTypeCode: fWorkerType,
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
    setApplied({ firstName: "", email: "", company: "", status: "all", workerTypeCode: "all", allSites: false });
    persistedSearch = null;
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
          <Metric icon={<Users className="h-5 w-5" />} tone="brand" value={query.data?.total ?? items.length} label={t("identities.metric.results")} />
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
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">{t("identities.status.active")}</SelectItem>
                <SelectItem value="Inactive">{t("identities.status.inactive")}</SelectItem>
                <SelectItem value="all">{t("identities.status.all")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("identities.filter.workerType")}>
            <Select value={fWorkerType} onValueChange={setFWorkerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("identities.workerType.all")}</SelectItem>
                <SelectItem value="Terceiros">{t("identities.workerType.contractor")}</SelectItem>
                <SelectItem value="Colaborador">{t("identities.workerType.employee")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("identities.filter.site")}>
            <Select value={fSite} onValueChange={setFSite}>
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
          ) : query.isLoading || query.isFetching ? (
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
              {(query.data?.total ?? 0) > items.length && (
                <div className="border-b border-[var(--rm-line-soft)] bg-[var(--rm-panel-2)] px-4 py-2 text-xs text-[var(--rm-dim)]">
                  {t("identities.showingFirst", {
                    shown: items.length,
                    total: query.data?.total ?? items.length,
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
