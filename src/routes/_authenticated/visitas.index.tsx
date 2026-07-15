import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, RefreshCw, LogIn, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, type VisitEvent, type VisitVisitor } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialsDialog } from "@/components/CredentialsDialog";

export const Route = createFileRoute("/_authenticated/visitas/")({
  head: () => ({ meta: [{ title: "Visitas — Argus ClearID" }] }),
  component: VisitasPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

/** Expected → CheckedIn → CheckedOut */
function visitorStateBadge(state: string | null | undefined, t: (k: string) => string) {
  const s = (state ?? "").toLowerCase();
  if (s === "checkedin") return <Badge>{t("visits.state.checkedIn")}</Badge>;
  if (s === "checkedout") return <Badge variant="secondary">{t("visits.state.checkedOut")}</Badge>;
  return <Badge variant="outline">{t("visits.state.expected")}</Badge>;
}

function VisitasPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const query = useQuery({
    queryKey: ["visits", applied],
    queryFn: () => argusApi.listVisits({ searchTerm: applied || undefined, take: 50 }),
    retry: false,
  });

  const visits = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("visits.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("visits.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {t("visits.refresh")}
          </Button>
          <Button size="sm" asChild>
            <Link to="/visitas/nova">
              <Plus className="mr-1 h-4 w-4" /> {t("visits.newVisit")}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex gap-2 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
              placeholder={t("visits.searchPlaceholder")}
              className="pl-8"
            />
          </div>
          <Button onClick={() => setApplied(search.trim())} disabled={query.isFetching}>
            {t("common.search")}
          </Button>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(query.error as ArgusApiError).message}
        </div>
      ) : visits.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("visits.emptyState")}</p>
      ) : (
        <div className="space-y-4">
          {visits.map((v) => (
            <VisitCard
              key={v.visitEventId}
              visit={v}
              onChanged={() => qc.invalidateQueries({ queryKey: ["visits"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Uma visita, com seus visitantes e as ações de portaria. */
function VisitCard({ visit, onChanged }: { visit: VisitEvent; onChanged: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const visitorsQuery = useQuery({
    queryKey: ["visit-visitors", visit.visitEventId],
    queryFn: () => argusApi.listVisitVisitors(visit.visitEventId),
    retry: false,
  });
  const visitors = visitorsQuery.data ?? [];

  const reload = async () => {
    setSel(new Set());
    await qc.invalidateQueries({ queryKey: ["visit-visitors", visit.visitEventId] });
    onChanged();
  };

  const checkIn = useMutation({
    mutationFn: (ids: string[]) => argusApi.checkInVisitors(visit.visitEventId, ids),
    onSuccess: async (_r, ids) => {
      toast.success(t("visits.checkedInToast", { n: ids.length }));
      await reload();
    },
    onError: (e) => toast.error((e as ArgusApiError).message, { duration: 10000 }),
  });

  const checkOut = useMutation({
    mutationFn: (ids: string[]) => argusApi.checkOutVisitors(visit.visitEventId, ids),
    onSuccess: async (_r, ids) => {
      toast.success(t("visits.checkedOutToast", { n: ids.length }));
      await reload();
    },
    onError: (e) => toast.error((e as ArgusApiError).message, { duration: 10000 }),
  });

  const busy = checkIn.isPending || checkOut.isPending;
  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stateOf = (v: VisitVisitor) => (v.visitorState ?? "").toLowerCase();
  const selArr = [...sel];
  const canCheckIn = selArr.some((id) => stateOf(visitors.find((v) => v.visitorId === id)!) !== "checkedin");
  const canCheckOut = selArr.some(
    (id) => stateOf(visitors.find((v) => v.visitorId === id)!) === "checkedin",
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{visit.visitEventName || "—"}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(visit.startDateTimeUtc)} → {formatDate(visit.endDateTimeUtc)}
          </p>
          {visit.reason && <p className="mt-1 text-xs text-muted-foreground">{visit.reason}</p>}
        </div>
        <Badge variant={(visit.status ?? "").toLowerCase() === "approved" ? "default" : "outline"}>
          {visit.status || "—"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {visitorsQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : visitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("visits.noVisitors")}</p>
        ) : (
          <>
            <div className="space-y-1">
              {visitors.map((v) => (
                <div
                  key={v.visitorId}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <Checkbox
                    checked={sel.has(v.visitorId)}
                    onCheckedChange={() => toggle(v.visitorId)}
                    disabled={busy}
                  />
                  <span className="flex-1">
                    {[v.firstName, v.lastName].filter(Boolean).join(" ") || "—"}
                    {v.email && (
                      <span className="ml-2 text-xs text-muted-foreground">{v.email}</span>
                    )}
                  </span>
                  {visitorStateBadge(v.visitorState, t)}
                  {v.identityId ? (
                    <CredentialsDialog identityId={v.identityId} />
                  ) : (
                    // Sem identityId não dá para atribuir credencial (API exige).
                    <span className="text-xs text-muted-foreground">
                      {t("visits.noIdentityForCredential")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!canCheckIn || busy}
                onClick={() => checkIn.mutate(selArr)}
              >
                {checkIn.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-1 h-4 w-4" />
                )}
                {t("visits.checkIn")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canCheckOut || busy}
                onClick={() => checkOut.mutate(selArr)}
              >
                {checkOut.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-1 h-4 w-4" />
                )}
                {t("visits.checkOut")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
