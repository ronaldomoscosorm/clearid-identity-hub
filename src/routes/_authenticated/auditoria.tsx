import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, Loader2, ScrollText, ChevronLeft, ChevronRight, X } from "lucide-react";
import { argusApi, useActiveProfile, type AuditEntry, type AuditSearchParams } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { DatePickerField } from "@/components/DatePickerField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Argus ClearID" }] }),
  component: AuditoriaPage,
});

const ACTIONS = [
  "created", "updated", "deleted", "imported", "login", "logout",
  "member_added", "member_removed", "photo_updated", "synchronized", "checked_in", "checked_out", "other",
];
const ENTITIES = [
  "identity", "company", "visit", "visitor", "team", "credential", "custom_field", "site_field", "worker_type",
  "form_layout", "field_label", "employer_site", "import", "import_mapping", "settings", "branding", "session",
];
const ALL = "__all__";

type Filters = {
  q: string;
  userName: string;
  action: string;
  entityType: string;
  from: string;
  to: string;
  allProfiles: boolean;
};
const EMPTY: Filters = { q: "", userName: "", action: "", entityType: "", from: "", to: "", allProfiles: false };

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function AuditoriaPage() {
  const { t } = useT();
  const activeProfile = useActiveProfile();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const pageSize = 50;

  const params = useMemo<AuditSearchParams>(() => {
    const p: AuditSearchParams = { page, pageSize };
    if (filters.q.trim()) p.q = filters.q.trim();
    if (filters.userName.trim()) p.userName = `*${filters.userName.trim()}*`;
    if (filters.action) p.action = filters.action;
    if (filters.entityType) p.entityType = filters.entityType;
    if (filters.from) p.from = new Date(`${filters.from}T00:00:00`).toISOString();
    if (filters.to) p.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
    if (filters.allProfiles) p.allProfiles = true;
    return p;
  }, [filters, page]);

  const query = useQuery({
    queryKey: ["audit", activeProfile, params],
    queryFn: () => argusApi.searchAudit(params),
    retry: false,
    placeholderData: (prev) => prev,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const apply = () => {
    setFilters(draft);
    setPage(1);
  };
  const clear = () => {
    setDraft(EMPTY);
    setFilters(EMPTY);
    setPage(1);
  };

  const exportCsv = () => {
    const header = ["occurredAt", "userName", "profile", "action", "entityType", "entityId", "entityLabel", "summary", "source", "route", "statusCode", "traceId", "details"];
    const lines = [header.join(";")];
    for (const e of items) {
      lines.push([e.occurredAt, e.userName, e.profile, e.action, e.entityType, e.entityId, e.entityLabel, e.summary, e.source, e.route, e.statusCode, e.traceId, e.details]
        .map(csvEscape).join(";"));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${activeProfile}-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionLabel = (a: string) => {
    const key = `audit.action.${a}`;
    const v = t(key);
    return v === key ? a : v;
  };
  const actionTone = (a: string) =>
    a === "deleted" ? "border-destructive/50 text-destructive"
    : a === "created" || a === "imported" ? "border-[var(--success)]/50 text-[var(--success)]"
    : a === "login" || a === "logout" ? "text-muted-foreground"
    : "border-[var(--rm-brand)]/40 text-[var(--rm-brand-ink)]";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <ScrollText className="h-6 w-6" /> {t("audit.title")}
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {filters.allProfiles ? t("audit.filter.allProfiles") : `${t("shell.profile")}: ${activeProfile}`}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("audit.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={items.length === 0}>
          <Download className="mr-1 h-4 w-4" /> {t("audit.export")}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1.5 md:col-span-3 lg:col-span-2">
            <Label htmlFor="audit-q">{t("audit.filter.search")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-q"
                className="pl-8"
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && apply()}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-user">{t("audit.filter.user")}</Label>
            <Input id="audit-user" value={draft.userName} onChange={(e) => setDraft((d) => ({ ...d, userName: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && apply()} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("audit.filter.action")}</Label>
            <Select value={draft.action || ALL} onValueChange={(v) => setDraft((d) => ({ ...d, action: v === ALL ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("audit.filter.all")}</SelectItem>
                {ACTIONS.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("audit.filter.entity")}</Label>
            <Select value={draft.entityType || ALL} onValueChange={(v) => setDraft((d) => ({ ...d, entityType: v === ALL ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("audit.filter.all")}</SelectItem>
                {ENTITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("audit.filter.from")}</Label>
            <DatePickerField value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} trackExpiration={false} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("audit.filter.to")}</Label>
            <DatePickerField value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} trackExpiration={false} />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Switch checked={draft.allProfiles} onCheckedChange={(v) => setDraft((d) => ({ ...d, allProfiles: v }))} />
            {t("audit.filter.allProfiles")}
          </label>
          <div className="flex items-end justify-end gap-2 md:col-span-3 lg:col-span-4">
            <Button variant="outline" onClick={clear}><X className="mr-1 h-4 w-4" /> {t("audit.filter.clear")}</Button>
            <Button onClick={apply}>
              {query.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
              {t("audit.filter.apply")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("audit.total", { count: total })}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("audit.page", { page, pages })}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)} aria-label={t("audit.prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= pages || query.isFetching} onClick={() => setPage((p) => p + 1)} aria-label={t("audit.next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(query.error as Error).message}
            </div>
          ) : query.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("audit.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("audit.col.when")}</TableHead>
                    <TableHead>{t("audit.col.user")}</TableHead>
                    <TableHead>{t("audit.col.action")}</TableHead>
                    <TableHead>{t("audit.col.entity")}</TableHead>
                    <TableHead>{t("audit.col.summary")}</TableHead>
                    <TableHead>{t("audit.col.source")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => (
                    <TableRow key={e.id ?? `${e.occurredAt}-${e.userName}-${e.route}`} className="cursor-pointer" onClick={() => setSelected(e)}>
                      <TableCell className="whitespace-nowrap text-xs tnum">{fmtWhen(e.occurredAt)}</TableCell>
                      <TableCell className="text-sm">{e.userName}</TableCell>
                      <TableCell><Badge variant="outline" className={actionTone(e.action)}>{actionLabel(e.action)}</Badge></TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{e.entityType ?? "—"}</span>
                        {e.entityLabel && <span className="block truncate font-medium">{e.entityLabel}</span>}
                      </TableCell>
                      <TableCell className="max-w-[420px] truncate text-sm" title={e.summary ?? undefined}>{e.summary ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t(`audit.source.${e.source}`)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("audit.details.title")}</DialogTitle>
            <DialogDescription>
              {selected && `${fmtWhen(selected.occurredAt)} · ${selected.userName} · ${selected.profile ?? ""}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p className="font-medium">{selected.summary ?? "—"}</p>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t("audit.col.action")}</dt><dd>{actionLabel(selected.action)}</dd>
                <dt className="text-muted-foreground">{t("audit.col.entity")}</dt><dd>{[selected.entityType, selected.entityId].filter(Boolean).join(" · ") || "—"}</dd>
                <dt className="text-muted-foreground">{t("audit.col.source")}</dt><dd>{t(`audit.source.${selected.source}`)}</dd>
                {selected.route && (<><dt className="text-muted-foreground">{t("audit.details.route")}</dt><dd className="break-all font-mono">{selected.method} {selected.route}</dd></>)}
                {selected.statusCode != null && (<><dt className="text-muted-foreground">{t("audit.details.status")}</dt><dd>{selected.statusCode}</dd></>)}
                {selected.traceId && (<><dt className="text-muted-foreground">{t("audit.details.trace")}</dt><dd className="font-mono">{selected.traceId}</dd></>)}
                {selected.ipAddress && (<><dt className="text-muted-foreground">{t("audit.details.ip")}</dt><dd className="font-mono">{selected.ipAddress}</dd></>)}
              </dl>
              {selected.details != null && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("audit.details.data")}</p>
                  <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                    {JSON.stringify(selected.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
