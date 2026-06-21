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
  User,
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
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Sempre que a página de regras for exibida, refaz o fetch para verificar
  // se há novas regras cadastradas.
  useEffect(() => {
    if (!siteId) return;
    const toastId = toast.loading("Verificando novas regras...");
    teamsQuery
      .refetch()
      .then((res) => {
        if (res.error) {
          toast.error("Falha ao atualizar regras.", { id: toastId });
        } else {
          toast.success("Regras atualizadas.", { id: toastId });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        toast.error(`Falha ao atualizar regras: ${msg}`, { id: toastId });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

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
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {selectedTeam?.name ?? "Membros"}
              {membersQuery.isFetching && !membersQuery.isLoading && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Atualizando...
                </span>
              )}
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
        teamName={selectedTeam?.name ?? null}
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
  teamName,
  siteId,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string | null;
  teamName: string | null;
  siteId: string | null;
}) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<Record<string, ClearIdIdentity>>({});
  const [startAt, setStartAt] = useState<string>(() => currentLocalDateTimeValue());
  const [endAt, setEndAt] = useState<string>("");
  const [searchAllSites, setSearchAllSites] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected({});
    setSearchInput("");
    setQuery("");
    setSearchAllSites(false);
    setStartAt(currentLocalDateTimeValue());
    setEndAt("");
  }, [open]);

  // Debounce search input so we pesquisamos a medida que o usuário digita,
  // sem disparar uma requisição a cada tecla.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchQuery = useQuery({
    queryKey: ["identity-search", siteId, query, searchAllSites],
    queryFn: () =>
      argusApi.listIdentities({ query, take: 50, allSites: searchAllSites }),
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
      if (next[i.identityId]) {
        delete next[i.identityId];
      } else {
        next[i.identityId] = i;
        // Ao escolher um nome, limpa o texto de pesquisa para uma nova busca.
        setSearchInput("");
        setQuery("");
      }
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
      setSearchInput("");
      setQuery("");
      setStartAt(currentLocalDateTimeValue());
      setEndAt("");
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
          <DialogTitle>
            Adicionar membros{teamName ? ` — ${teamName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Pesquise por nome ou email. Por padrão, a busca é feita no site
            atual — marque "Todos os sites" para pesquisar em todos. Selecione
            um membro para limpar a busca e procurar outro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-primary">
            Identidades <span className="text-primary">*</span>
          </Label>
          <div
            className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"
            onClick={(e) => {
              const input = (e.currentTarget.querySelector(
                "input[data-chip-input]",
              ) as HTMLInputElement | null);
              input?.focus();
            }}
          >
            {selectedList.map((i) => {
              const name = `${i.firstName ?? ""} ${i.lastName ?? ""}`.trim() || i.identityId;
              return (
                <span
                  key={i.identityId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-sm"
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(i);
                    }}
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20"
                    aria-label={`Remover ${name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
            <input
              data-chip-input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Digite para pesquisar..."
              autoFocus
              className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !searchInput && selectedList.length > 0) {
                  toggle(selectedList[selectedList.length - 1]);
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {selectedList.length} / 99
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={searchAllSites}
                onCheckedChange={(v) => setSearchAllSites(!!v)}
              />
              <span>Pesquisar em todos os sites</span>
            </label>
          </div>
        </div>

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