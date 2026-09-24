import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, RefreshCw, Eye, Search, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  argusApi,
  ArgusApiError,
  useDefaultSiteId,
  type PhotoCampaignResult,
  type PhotoCampaignTarget,
} from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

export const Route = createFileRoute("/_authenticated/campanhas-foto")({
  head: () => ({ meta: [{ title: "Campanhas de Foto — Argus ClearID" }] }),
  component: CampanhasFotoPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function statusBadge(
  t: (k: string, vars?: Record<string, string | number>) => string,
  status: string,
) {
  switch (status) {
    case "Sent":
      return <Badge>{t("campaigns.status.sent")}</Badge>;
    case "Used":
      return <Badge variant="secondary">{t("campaigns.status.used")}</Badge>;
    case "Failed":
      return <Badge variant="destructive">{t("campaigns.status.failed")}</Badge>;
    case "SkippedNoEmail":
      return <Badge variant="outline">{t("campaigns.noEmailLabel")}</Badge>;
    default:
      return <Badge variant="secondary">{t("campaigns.status.pending")}</Badge>;
  }
}

function CampanhasFotoPage() {
  const { t } = useT();
  const siteId = useDefaultSiteId();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PhotoCampaignResult | null>(null);
  const [deleting, setDeleting] = useState<PhotoCampaignResult | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => argusApi.deletePhotoCampaign(id),
    onSuccess: () => {
      toast.success(t("campaigns.deleteSuccess"));
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["photo-campaigns"] });
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const listQuery = useQuery({
    queryKey: ["photo-campaigns"],
    queryFn: () => argusApi.listPhotoCampaigns(),
    retry: false,
  });

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("campaigns.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("campaigns.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            {t("campaigns.refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("campaigns.newCampaign")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {listQuery.data
              ? items.length === 1
                ? t("campaigns.countOne", { count: items.length })
                : t("campaigns.countOther", { count: items.length })
              : t("campaigns.heading")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : listQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(listQuery.error as ArgusApiError).message}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("campaigns.emptyState")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("campaigns.col.environment")}</TableHead>
                  <TableHead>{t("campaigns.col.targets")}</TableHead>
                  <TableHead>{t("campaigns.col.sent")}</TableHead>
                  <TableHead>{t("campaigns.noEmailLabel")}</TableHead>
                  <TableHead>{t("campaigns.col.failed")}</TableHead>
                  <TableHead>{t("campaigns.col.created")}</TableHead>
                  <TableHead className="w-[130px] text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium">{c.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.environment}</Badge>
                      {c.dryRun && <Badge variant="outline" className="ml-1">{t("campaigns.dryRun")}</Badge>}
                    </TableCell>
                    <TableCell>{c.totalTargets}</TableCell>
                    <TableCell>{c.sent}</TableCell>
                    <TableCell className="text-muted-foreground">{c.skippedNoEmail}</TableCell>
                    <TableCell className={c.failed ? "text-destructive" : "text-muted-foreground"}>
                      {c.failed}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.createdUtc)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("campaigns.detailAction")}
                          onClick={() => setDetailId(c.campaignId)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("common.rename")}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("common.delete")}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        siteId={siteId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["photo-campaigns"] });
        }}
      />
      <CampaignDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      <RenameCampaignDialog
        campaign={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["photo-campaigns"] });
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("campaigns.deleteConfirmPrefix")}{" "}
              <strong>{deleting?.name || t("campaigns.unnamed")}</strong>{" "}
              {t("campaigns.deleteConfirmSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMutation.mutate(deleting.campaignId);
              }}
            >
              {deleteMutation.isPending ? t("campaigns.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RenameCampaignDialog({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: PhotoCampaignResult | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");

  useEffect(() => {
    setName(campaign?.name ?? "");
  }, [campaign]);

  const rename = useMutation({
    mutationFn: () =>
      argusApi.updatePhotoCampaign(campaign!.campaignId, { name: name.trim() || null }),
    onSuccess: () => {
      toast.success(t("campaigns.updateSuccess"));
      onSaved();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  return (
    <Dialog open={Boolean(campaign)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> {t("campaigns.renameTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("campaigns.renameDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rename">{t("common.name")}</Label>
          <Input
            id="rename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !rename.isPending && rename.mutate()}
            placeholder={t("campaigns.namePlaceholder")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => rename.mutate()} disabled={rename.isPending}>
            {rename.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateCampaignDialog({
  open,
  onOpenChange,
  siteId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId?: string | null;
  onCreated: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"site" | "identities">("site");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({}); // id -> displayName

  const idsQuery = useQuery({
    queryKey: ["identities-search-campaign", siteId, applied],
    queryFn: () => argusApi.listIdentities({ query: applied, take: 50 }),
    enabled: mode === "identities" && applied.length > 0,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      argusApi.createPhotoCampaign({
        name: name.trim() || undefined,
        ...(mode === "site"
          ? { siteId: siteId ?? null }
          : { identityIds: Object.keys(selected) }),
      }),
    onSuccess: (r: PhotoCampaignResult) => {
      toast.success(
        r.dryRun
          ? t("campaigns.createdDryRun", { total: r.totalTargets })
          : t("campaigns.createdResult", {
              sent: r.sent,
              noEmail: r.skippedNoEmail,
              failed: r.failed,
            }),
      );
      onCreated();
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const reset = () => {
    setName("");
    setMode("site");
    setSearch("");
    setApplied("");
    setSelected({});
  };

  const toggle = (id: string, displayName: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = displayName;
      return next;
    });

  const submit = () => {
    if (mode === "site" && !siteId) {
      toast.error(t("campaigns.selectDefaultSite"));
      return;
    }
    if (mode === "identities" && Object.keys(selected).length === 0) {
      toast.error(t("campaigns.selectAtLeastOne"));
      return;
    }
    create.mutate();
  };

  const results = idsQuery.data?.items ?? [];
  const selectedCount = Object.keys(selected).length;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : (reset(), onOpenChange(false)))}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> {t("campaigns.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("campaigns.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="camp-name">{t("campaigns.nameOptional")}</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("campaigns.namePlaceholderExample")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("campaigns.targets")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "site" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("site")}
              >
                {t("campaigns.wholeSite")}
              </Button>
              <Button
                type="button"
                variant={mode === "identities" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("identities")}
              >
                {t("campaigns.selectIdentities")}
              </Button>
            </div>
          </div>

          {mode === "identities" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
                  placeholder={t("campaigns.searchPlaceholder")}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setApplied(search.trim())}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {idsQuery.isFetching ? (
                  <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("campaigns.searching")}
                  </div>
                ) : applied && results.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">{t("campaigns.noIdentitiesFound")}</p>
                ) : (
                  results.map((i) => {
                    const dn = `${i.firstName} ${i.lastName}`.trim();
                    return (
                      <label
                        key={i.identityId}
                        className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={Boolean(selected[i.identityId])}
                          onCheckedChange={() => toggle(i.identityId, dn)}
                        />
                        <span className="flex-1">{dn}</span>
                        <span className="text-xs text-muted-foreground">{i.email ?? t("campaigns.noEmailValue")}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedCount > 0 && (
                <p className="text-xs text-muted-foreground">{t("campaigns.selectedCount", { count: selectedCount })}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (reset(), onOpenChange(false))}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("campaigns.dispatching") : t("campaigns.dispatch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useT();
  const query = useQuery({
    queryKey: ["photo-campaign", id],
    queryFn: () => argusApi.getPhotoCampaign(id as string),
    enabled: Boolean(id),
    retry: false,
  });
  const targets: PhotoCampaignTarget[] = query.data?.targets ?? [];

  return (
    <Dialog open={Boolean(id)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{query.data?.name || t("campaigns.detailFallbackTitle")}</DialogTitle>
          <DialogDescription>{t("campaigns.detailDescription")}</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">{(query.error as ArgusApiError).message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("campaigns.col.identity")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("campaigns.col.expires")}</TableHead>
                <TableHead>{t("campaigns.col.used")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((target) => (
                <TableRow key={target.identityId}>
                  <TableCell className="font-medium">{target.displayName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{target.email ?? "—"}</TableCell>
                  <TableCell>
                    {statusBadge(t, target.status)}
                    {target.error && <p className="mt-1 text-xs text-destructive">{target.error}</p>}
                    {target.dryRunLink && (
                      <a
                        href={target.dryRunLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-primary underline"
                      >
                        {t("campaigns.dryRunLink")}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(target.expiresUtc)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(target.usedUtc)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
