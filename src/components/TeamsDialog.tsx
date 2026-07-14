import { useMemo, useState } from "react";
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

type Row = { teamId: string; name: string };

export function TeamsDialog({
  identityId,
  siteId,
}: {
  identityId: string;
  siteId?: string | null;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const allQuery = useQuery({
    queryKey: ["teams-all", siteId ?? "default"],
    queryFn: () => argusApi.listTeams({ take: 1000, siteId }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const assignedQuery = useQuery({
    queryKey: ["identity-teams", identityId, siteId ?? "default"],
    queryFn: () => argusApi.getIdentityTeams(identityId, { siteId }),
    enabled: open,
  });

  const loading = allQuery.isLoading || assignedQuery.isLoading;

  const assignedSet = useMemo(
    () => new Set((assignedQuery.data ?? []).map((m) => m.teamId)),
    [assignedQuery.data],
  );

  const assigned: Row[] = useMemo(
    () =>
      (assignedQuery.data ?? [])
        .map((m) => ({ teamId: m.teamId, name: m.teamName ?? m.teamId }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [assignedQuery.data],
  );

  const available: Row[] = useMemo(
    () =>
      (allQuery.data ?? [])
        .filter((tm) => !assignedSet.has(tm.teamId))
        .map((tm) => ({ teamId: tm.teamId, name: tm.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [allQuery.data, assignedSet],
  );

  const [leftSel, setLeftSel] = useState<Set<string>>(new Set());
  const [rightSel, setRightSel] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);

  // Recarrega as duas listas. Pequeno atraso para o índice do ClearID refletir
  // a inclusão/remoção antes do refetch.
  const refresh = async () => {
    await new Promise((r) => setTimeout(r, 900));
    await Promise.all([allQuery.refetch(), assignedQuery.refetch()]);
  };

  const include = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((tid) => argusApi.addTeamMembers(tid, { identityIds: [identityId], siteId })),
      ),
    onSuccess: async (_r, ids) => {
      toast.success(t("teams.included", { n: ids.length }));
      setLeftSel(new Set());
      await refresh();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((tid) => argusApi.removeTeamMembers(tid, { identityIds: [identityId], siteId })),
      ),
    onSuccess: async (_r, ids) => {
      toast.success(t("teams.removed", { n: ids.length }));
      setRightSel(new Set());
      await refresh();
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
                <span className="truncate">{r.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
