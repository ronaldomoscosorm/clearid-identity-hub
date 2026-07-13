import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, RefreshCw, Eye, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  argusApi,
  ArgusApiError,
  useDefaultSiteId,
  type PhotoCampaignResult,
  type PhotoCampaignTarget,
} from "@/lib/argus-client";
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

function statusBadge(status: string) {
  switch (status) {
    case "Sent":
      return <Badge>Enviado</Badge>;
    case "Used":
      return <Badge variant="secondary">Utilizado</Badge>;
    case "Failed":
      return <Badge variant="destructive">Falhou</Badge>;
    case "SkippedNoEmail":
      return <Badge variant="outline">Sem e-mail</Badge>;
    default:
      return <Badge variant="secondary">Pendente</Badge>;
  }
}

function CampanhasFotoPage() {
  const siteId = useDefaultSiteId();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campanhas de Foto</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recadastramento de biometria facial por link de uso único enviado por e-mail.
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
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova campanha
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {listQuery.data
              ? `${items.length} ${items.length === 1 ? "campanha" : "campanhas"}`
              : "Campanhas"}
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
              Nenhuma campanha criada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead>Alvos</TableHead>
                  <TableHead>Enviados</TableHead>
                  <TableHead>Sem e-mail</TableHead>
                  <TableHead>Falhas</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead className="w-[80px] text-right">Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium">{c.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.environment}</Badge>
                      {c.dryRun && <Badge variant="outline" className="ml-1">DryRun</Badge>}
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
                      <Button variant="ghost" size="icon" onClick={() => setDetailId(c.campaignId)}>
                        <Eye className="h-4 w-4" />
                      </Button>
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
    </div>
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
          ? `Campanha criada (DryRun) — ${r.totalTargets} alvo(s), nenhum e-mail enviado.`
          : `Campanha criada — ${r.sent} enviado(s), ${r.skippedNoEmail} sem e-mail, ${r.failed} falha(s).`,
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
      toast.error("Selecione um site padrão em Configurações.");
      return;
    }
    if (mode === "identities" && Object.keys(selected).length === 0) {
      toast.error("Selecione ao menos uma identidade.");
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
            <Camera className="h-5 w-5" /> Nova campanha de foto
          </DialogTitle>
          <DialogDescription>
            Dispara um link de uso único por e-mail para recadastro da foto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="camp-name">Nome (opcional)</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atualização de foto 2026"
            />
          </div>

          <div className="space-y-2">
            <Label>Alvos</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "site" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("site")}
              >
                Todo o site
              </Button>
              <Button
                type="button"
                variant={mode === "identities" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("identities")}
              >
                Selecionar identidades
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
                  placeholder="Buscar por nome ou e-mail"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setApplied(search.trim())}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {idsQuery.isFetching ? (
                  <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                  </div>
                ) : applied && results.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">Nenhuma identidade encontrada.</p>
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
                        <span className="text-xs text-muted-foreground">{i.email ?? "sem e-mail"}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedCount > 0 && (
                <p className="text-xs text-muted-foreground">{selectedCount} selecionada(s)</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (reset(), onOpenChange(false))}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Disparando..." : "Disparar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
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
          <DialogTitle>{query.data?.name || "Campanha"}</DialogTitle>
          <DialogDescription>Status por identidade.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">{(query.error as ArgusApiError).message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identidade</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Usado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t) => (
                <TableRow key={t.identityId}>
                  <TableCell className="font-medium">{t.displayName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.email ?? "—"}</TableCell>
                  <TableCell>
                    {statusBadge(t.status)}
                    {t.error && <p className="mt-1 text-xs text-destructive">{t.error}</p>}
                    {t.dryRunLink && (
                      <a
                        href={t.dryRunLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-primary underline"
                      >
                        link (DryRun)
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(t.expiresUtc)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(t.usedUtc)}
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
