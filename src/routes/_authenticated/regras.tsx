import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Eye,
  Mail,
  RefreshCw,
  ExternalLink,
  Plus,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { z } from "zod";
import {
  argusApi,
  useDefaultSiteId,
  type ClearIdIdentity,
} from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IdentityThumb } from "@/components/IdentityThumb";

const searchSchema = z.object({
  teamId: z.string().optional(),
  view: z.string().optional(),
});
type RegrasSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/regras")({
  head: () => ({ meta: [{ title: "Regras — Argus ClearID" }] }),
  validateSearch: (s: Record<string, unknown>): RegrasSearch => searchSchema.parse(s),
  component: RegrasPage,
});

function RegrasPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { teamId, view } = Route.useSearch();
  const siteId = useDefaultSiteId();
  const [addOpen, setAddOpen] = useState(false);

  const teamsQuery = useQuery({
    queryKey: ["teams", siteId],
    queryFn: () => argusApi.listTeams({ take: 100 }),
    enabled: !!siteId,
    retry: false,
  });

  const sortedTeams = (teamsQuery.data ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  const selectedTeam = sortedTeams.find((t) => t.teamId === teamId);

  const membersQuery = useQuery({
    queryKey: ["team-members", siteId, teamId],
    queryFn: () => argusApi.listTeamMembers(teamId!, { count: 500 }),
    enabled: !!teamId,
    retry: false,
  });

  const setTeam = (id: string) => {
    navigate({ search: () => ({ teamId: id || undefined, view: undefined }) });
  };
  const openView = (id: string) => {
    navigate({ search: (prev: RegrasSearch) => ({ ...prev, view: id }) });
  };
  const closeView = () => {
    navigate({ search: (prev: RegrasSearch) => ({ ...prev, view: undefined }) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Regras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione uma regra para visualizar seus membros no site padrão.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1 space-y-2">
            <Label htmlFor="team">Regra</Label>
            <Select
              value={teamId ?? ""}
              onValueChange={setTeam}
              disabled={!siteId || teamsQuery.isLoading || !!teamsQuery.error}
            >
              <SelectTrigger id="team">
                <SelectValue
                  placeholder={
                    !siteId
                      ? "Selecione um site padrão em Configurações"
                      : teamsQuery.isLoading
                      ? "Carregando regras..."
                      : teamsQuery.error
                        ? "Falha ao carregar regras"
                        : "Selecione uma regra"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sortedTeams.map((t) => (
                  <SelectItem key={t.teamId} value={t.teamId}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {teamId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => membersQuery.refetch()}
                disabled={membersQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${membersQuery.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar membros
              </Button>
            </>
          )}
        </div>
        {teamsQuery.error && (
          <p className="mt-2 text-sm text-destructive">{(teamsQuery.error as Error).message}</p>
        )}
      </Card>

      {!teamId ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Selecione uma regra acima para listar seus membros.
        </Card>
      ) : (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {selectedTeam?.name ?? "Membros"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {membersQuery.isLoading
                ? "Carregando..."
                : `${membersQuery.data?.length ?? 0} membro(s)`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden font-mono text-xs md:table-cell">Identity ID</TableHead>
                <TableHead className="w-14"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : membersQuery.error ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-destructive">
                    {(membersQuery.error as Error).message}
                  </TableCell>
                </TableRow>
              ) : (membersQuery.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum membro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                (membersQuery.data ?? [])
                  .slice()
                  .sort((a, b) => {
                    const an = (a.identityName ?? "").trim();
                    const bn = (b.identityName ?? "").trim();
                    return an.localeCompare(bn, "pt-BR", { sensitivity: "base" });
                  })
                  .map((m) => (
                    <TableRow key={m.identityId} className="cursor-pointer" onClick={() => openView(m.identityId)}>
                      <TableCell>
                        <IdentityThumb identityId={m.identityId} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.identityName?.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.identityEmail ?? "—"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {m.identityId}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Ações</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openView(m.identityId)}>
                              <Eye className="mr-2 h-4 w-4" /> Visualizar
                            </DropdownMenuItem>
                            {m.identityEmail && (
                              <DropdownMenuItem asChild>
                                <a href={`mailto:${m.identityEmail}`}>
                                  <Mail className="mr-2 h-4 w-4" /> Enviar e-mail
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <ViewIdentityDialog identityId={view ?? null} onClose={closeView} />
      <AddMembersDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        teamId={teamId ?? null}
        siteId={siteId}
      />
    </div>
  );
}

function ViewIdentityDialog({
  identityId,
  onClose,
}: {
  identityId: string | null;
  onClose: () => void;
}) {
  const open = !!identityId;
  const query = useQuery({
    queryKey: ["identity", identityId],
    queryFn: () => (identityId ? argusApi.getIdentity(identityId) : Promise.resolve(null)),
    enabled: open,
    retry: false,
  });
  const data = query.data as ClearIdIdentity | null | undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : "Identity"}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {identityId}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        ) : data ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-3">
              <IdentityThumb identityId={data.identityId} className="h-16 w-16" />
              <div>
                <div className="text-base font-semibold">
                  {`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()}
                </div>
                <Badge variant={data.status === "Active" ? "default" : "secondary"}>
                  {data.status}
                </Badge>
              </div>
            </div>
            <Field label="Email" value={data.email} />
            <Field label="External ID" value={data.externalId ?? data.systemData?.externalId} mono />
            <Field label="Identity Type" value={data.identityType} />
            <Field label="Country" value={data.countryCode} />
            <Field
              label="Job Title"
              value={(data.companyData as Record<string, unknown> | null)?.jobTitle as string | undefined}
            />
            <Field
              label="Company"
              value={(data.companyData as Record<string, unknown> | null)?.companyName as string | undefined}
            />
            <Field
              label="Department"
              value={(data.companyData as Record<string, unknown> | null)?.departmentName as string | undefined}
            />
            <Field label="Description" value={data.description} />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {data && (
            <Button asChild>
              <Link to="/identities/$id" params={{ id: data.identityId }}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir edição
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={mono ? "font-mono text-sm" : "text-sm"}>{value || "—"}</div>
    </div>
  );
}

function toUtcIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function currentLocalDateTimeValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function AddMembersDialog({
  open,
  onClose,
  teamId,
  siteId,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string | null;
  siteId: string | null;
}) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, ClearIdIdentity>>({});
  const [startAt, setStartAt] = useState<string>(() => currentLocalDateTimeValue());
  const [endAt, setEndAt] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setStartAt(currentLocalDateTimeValue());
    setEndAt("");
  }, [open]);

  const searchQuery = useQuery({
    queryKey: ["identity-search", siteId, query],
    queryFn: () => argusApi.listIdentities({ query, take: 50 }),
    enabled: open && !!query,
    retry: false,
  });

  const items = useMemo(() => {
    const arr = (searchQuery.data?.items ?? []).slice();
    arr.sort((a, b) => {
      const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
      const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
      return an.localeCompare(bn, "pt-BR", { sensitivity: "base" });
    });
    return arr;
  }, [searchQuery.data]);

  const selectedList = Object.values(selected);

  const toggle = (i: ClearIdIdentity) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[i.identityId]) delete next[i.identityId];
      else next[i.identityId] = i;
      return next;
    });
  };

  const submit = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!teamId) throw new Error("Selecione uma regra antes.");
      return argusApi.addTeamMembers(teamId, {
        identityIds: ids,
        sourceId: siteId ?? null,
        startDateTimeUtc: toUtcIso(startAt),
        endDateTimeUtc: toUtcIso(endAt),
        reason: "Portal Argus",
      });
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} membro(s) adicionado(s).`);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setSelected({});
      onClose();
      const toastId = toast.loading("Atualizando lista de membros...");
      queryClient
        .refetchQueries({ queryKey: ["team-members", siteId, teamId] })
        .then(() => toast.success("Lista de membros atualizada.", { id: toastId }))
        .catch((e: Error) =>
          toast.error(e.message || "Falha ao atualizar a lista de membros.", { id: toastId }),
        );
    },
    onError: (e: Error) => {
      toast.error(e.message || "Falha ao adicionar membros.");
    },
  });

  const handleClose = () => {
    if (submit.isPending) return;
    onClose();
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput.trim());
  };

  const handleAdd = () => {
    if (!startAt) {
      toast.error("Informe a data de início.");
      return;
    }
    const start = new Date(startAt);
    if (isNaN(start.getTime())) {
      toast.error("Data de início inválida.");
      return;
    }
    if (endAt) {
      const end = new Date(endAt);
      if (isNaN(end.getTime())) {
        toast.error("Data de término inválida.");
        return;
      }
      if (end <= start) {
        toast.error("A data de término deve ser posterior à data de início.");
        return;
      }
    }
    const count = selectedList.length;
    const endMsg = endAt
      ? `até ${new Date(endAt).toLocaleString()}`
      : "sem prazo final (data de término em branco)";
    const ok = window.confirm(
      `Confirma a adição de ${count} membro(s) a partir de ${new Date(startAt).toLocaleString()} ${endMsg}?`,
    );
    if (!ok) return;
    submit.mutate(selectedList.map((i) => i.identityId));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Adicionar membros</DialogTitle>
          <DialogDescription>
            Pesquise por nome ou email no site padrão. Você pode fazer várias pesquisas e selecionar diferentes membros antes de adicionar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nome ou email"
            autoFocus
          />
          <Button type="submit" variant="outline" disabled={!searchInput.trim()}>
            <Search className="mr-2 h-4 w-4" /> Pesquisar
          </Button>
        </form>

        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-14"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden font-mono text-xs md:table-cell">Identity ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!query ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Digite um nome ou email e clique em Pesquisar.
                  </TableCell>
                </TableRow>
              ) : searchQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Pesquisando...
                  </TableCell>
                </TableRow>
              ) : searchQuery.error ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-destructive">
                    {(searchQuery.error as Error).message}
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((i) => {
                  const checked = !!selected[i.identityId];
                  return (
                    <TableRow
                      key={i.identityId}
                      className="cursor-pointer"
                      onClick={() => toggle(i)}
                      data-state={checked ? "selected" : undefined}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={checked} onCheckedChange={() => toggle(i)} />
                      </TableCell>
                      <TableCell>
                        <IdentityThumb identityId={i.identityId} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {`${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {i.email ?? "—"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {i.identityId}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {selectedList.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Selecionados ({selectedList.length})
            </div>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
              {selectedList.map((i) => (
                <Badge key={i.identityId} variant="secondary" className="gap-1">
                  {`${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() || i.identityId}
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="ml-1 rounded hover:bg-muted-foreground/20"
                    aria-label="Remover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="startAt">Data de início</Label>
            <Input
              id="startAt"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endAt">Data de término</Label>
            <div className="flex gap-2">
              {endAt ? (
                <>
                  <Input
                    key="endAt-filled"
                    id="endAt"
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setEndAt("")}
                    disabled={submit.isPending}
                    aria-label="Limpar data de término"
                    title="Limpar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    key="endAt-empty"
                    id="endAt"
                    type="text"
                    value=""
                    readOnly
                    aria-label="Data de término em branco"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEndAt(currentLocalDateTimeValue())}
                    disabled={submit.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Definir
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submit.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedList.length === 0 || submit.isPending || !teamId}
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar {selectedList.length > 0 ? `(${selectedList.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}