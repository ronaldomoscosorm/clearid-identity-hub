import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldCheck, ChevronRight, ChevronLeft, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Row = { teamId: string; name: string; hint?: string };
type SiteRef = { siteId: string; name: string };

export function TeamsDialog({
  identityId,
  siteId,
  sites,
}: {
  identityId: string;
  /** Site de lotação da pessoa (escopo padrão das chamadas). */
  siteId?: string | null;
  /**
   * Sites cujas regras entram no catálogo (os sites do cliente que o usuário
   * logado pode acessar). Sem a lista, usa só `siteId`.
   */
  sites?: SiteRef[];
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // Sites consultados: a lista informada, garantindo o site da pessoa; ou só ele.
  const querySites = useMemo<SiteRef[]>(() => {
    const list = (sites ?? []).filter((x) => !!x.siteId);
    if (siteId && !list.some((x) => x.siteId === siteId)) {
      list.push({ siteId, name: list.length ? siteId.slice(0, 8) : "" });
    }
    return list;
  }, [sites, siteId]);
  const sitesKey = querySites.map((x) => x.siteId).join(",");

  // Catálogo = união das regras de cada site (uma chamada por site), com o(s)
  // site(s) de cada regra para exibição e para escopar incluir/remover.
  const allQuery = useQuery({
    queryKey: ["teams-all", sitesKey || "default"],
    queryFn: async () => {
      const teams = new Map<string, { teamId: string; name: string }>();
      const teamSites = new Map<string, SiteRef[]>();
      if (querySites.length === 0) {
        for (const tm of await argusApi.listTeams({ take: 1000, siteId })) {
          teams.set(tm.teamId, { teamId: tm.teamId, name: tm.name });
        }
        return { teams: [...teams.values()], teamSites };
      }
      const results = await Promise.all(
        querySites.map(async (st) => ({
          site: st,
          teams: await argusApi.listTeams({ take: 1000, siteId: st.siteId }).catch(() => []),
        })),
      );
      for (const r of results) {
        for (const tm of r.teams) {
          if (!teams.has(tm.teamId)) teams.set(tm.teamId, { teamId: tm.teamId, name: tm.name });
          const arr = teamSites.get(tm.teamId) ?? [];
          if (!arr.some((x) => x.siteId === r.site.siteId)) arr.push(r.site);
          teamSites.set(tm.teamId, arr);
        }
      }
      return { teams: [...teams.values()], teamSites };
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const teamSites = allQuery.data?.teamSites;
  // Site usado nas chamadas de incluir/remover: o do catálogo da regra, senão o da pessoa.
  const siteForTeam = (teamId: string): string | null | undefined =>
    teamSites?.get(teamId)?.[0]?.siteId ?? siteId;
  const hintForTeam = (teamId: string): string | undefined => {
    if (querySites.length < 2) return undefined;
    const names = (teamSites?.get(teamId) ?? []).map((x) => x.name).filter(Boolean);
    return names.length ? names.join(", ") : undefined;
  };
  const assignedQuery = useQuery({
    queryKey: ["identity-teams", identityId, siteId ?? "default"],
    queryFn: () => argusApi.getIdentityTeams(identityId, { siteId }),
    enabled: open,
  });

  // Fonte de verdade local das regras atribuídas: inicializada da API ao abrir
  // e atualizada NA HORA ao incluir/remover (após o 200). Não dependemos do
  // refetch, que pode vir defasado pelo índice do ClearID.
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [inited, setInited] = useState(false);
  useEffect(() => {
    if (!open) {
      setInited(false);
      return;
    }
    if (!inited && !allQuery.isLoading && !assignedQuery.isLoading) {
      setAssignedIds(new Set((assignedQuery.data ?? []).map((m) => m.teamId)));
      setInited(true);
    }
  }, [open, inited, allQuery.isLoading, assignedQuery.isLoading, assignedQuery.data]);

  const loading = allQuery.isLoading || assignedQuery.isLoading || !inited;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (allQuery.data?.teams ?? []).forEach((tm) => m.set(tm.teamId, tm.name));
    (assignedQuery.data ?? []).forEach((x) => {
      if (!m.has(x.teamId)) m.set(x.teamId, x.teamName ?? x.teamId);
    });
    return m;
  }, [allQuery.data, assignedQuery.data]);

  const catalogIds = useMemo(
    () => (allQuery.data?.teams ?? []).map((tm) => tm.teamId),
    [allQuery.data],
  );

  const sortRows = (ids: string[]): Row[] =>
    ids
      .map((id) => ({ teamId: id, name: nameById.get(id) ?? id, hint: hintForTeam(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const available = sortRows(catalogIds.filter((id) => !assignedIds.has(id)));
  const assigned = sortRows([...assignedIds]);

  const [leftSel, setLeftSel] = useState<Set<string>>(new Set());
  const [rightSel, setRightSel] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);

  const include = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((tid) =>
          argusApi.addTeamMembers(tid, { identityIds: [identityId], siteId: siteForTeam(tid) }),
        ),
      ),
    onSuccess: (_r, ids) => {
      toast.success(t("teams.included", { n: ids.length }));
      setAssignedIds((prev) => new Set([...prev, ...ids]));
      setLeftSel(new Set());
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((tid) =>
          argusApi.removeTeamMembers(tid, { identityIds: [identityId], siteId: siteForTeam(tid) }),
        ),
      ),
    onSuccess: (_r, ids) => {
      toast.success(t("teams.removed", { n: ids.length }));
      setAssignedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setRightSel(new Set());
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const busy = include.isPending || remove.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setLeftSel(new Set());
          setRightSel(new Set());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ShieldCheck className="mr-1 h-4 w-4" /> {t("teams.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t("teams.title")}
          </DialogTitle>
          <DialogDescription>{t("teams.description")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <ListColumn
              title={t("teams.available")}
              rows={available}
              selected={leftSel}
              onToggle={(idx) => toggle(setLeftSel, idx)}
              searchPlaceholder={t("teams.search")}
              emptyLabel={t("teams.empty")}
              disabled={busy}
            />

            <div className="flex justify-center gap-2 sm:flex-col sm:justify-center">
              <Button
                type="button"
                size="sm"
                disabled={leftSel.size === 0 || busy}
                onClick={() => include.mutate([...leftSel])}
                title={t("teams.include")}
              >
                {include.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span className="hidden sm:inline">{t("teams.include")}</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rightSel.size === 0 || busy}
                onClick={() => setConfirmRemove([...rightSel])}
                title={t("teams.remove")}
              >
                {remove.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("teams.remove")}</span>
                  </>
                )}
              </Button>
            </div>

            <ListColumn
              title={t("teams.assigned")}
              rows={assigned}
              selected={rightSel}
              onToggle={(idx) => toggle(setRightSel, idx)}
              searchPlaceholder={t("teams.search")}
              emptyLabel={t("teams.empty")}
              disabled={busy}
            />
          </div>
        )}
      </DialogContent>

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(v) => !v && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teams.confirmRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("teams.confirmRemoveDesc", { n: confirmRemove?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                const ids = confirmRemove ?? [];
                setConfirmRemove(null);
                if (ids.length) remove.mutate(ids);
              }}
            >
              {t("teams.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, teamId: string) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    return next;
  });
}

function ListColumn({
  title,
  rows,
  selected,
  onToggle,
  searchPlaceholder,
  emptyLabel,
  disabled,
}: {
  title: string;
  rows: Row[];
  selected: Set<string>;
  onToggle: (teamId: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  return (
    <div className="flex min-h-0 flex-col rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="border-b p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8"
        />
      </div>
      <div className="max-h-64 min-h-[8rem] flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          filtered.map((r) => {
            const isSel = selected.has(r.teamId);
            return (
              <button
                key={r.teamId}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(r.teamId)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50 ${
                  isSel ? "bg-primary/10 ring-1 ring-primary/40" : ""
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  }`}
                >
                  {isSel && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.name}</span>
                  {r.hint && (
                    <span className="block truncate text-[11px] text-muted-foreground">{r.hint}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
