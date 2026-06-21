import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Eye, Mail, RefreshCw, ExternalLink } from "lucide-react";
import { z } from "zod";
import {
  argusApi,
  useDefaultSiteId,
  type ClearIdIdentity,
} from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  locationId: z.string().optional(),
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
  const { locationId, view } = Route.useSearch();
  const siteId = useDefaultSiteId();

  const locationsQuery = useQuery({
    queryKey: ["locations", siteId],
    queryFn: () => argusApi.listLocations({ take: 200 }),
    enabled: !!siteId,
    retry: false,
  });

  const sortedLocations = (locationsQuery.data ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  const selectedLocation = sortedLocations.find((l) => l.locationId === locationId);
  const approverIds = selectedLocation?.approvers ?? [];

  const membersQuery = useQuery({
    queryKey: ["location-members", siteId, locationId, approverIds],
    queryFn: async () => {
      const results = await Promise.all(
        approverIds.map((id) => argusApi.getIdentity(id).catch(() => null)),
      );
      return results.filter((r): r is NonNullable<typeof r> => !!r);
    },
    enabled: !!locationId && approverIds.length > 0,
    retry: false,
  });

  const setLocation = (id: string) => {
    navigate({ search: () => ({ locationId: id || undefined, view: undefined }) });
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
            <Label htmlFor="location">Regra</Label>
            <Select
              value={locationId ?? ""}
              onValueChange={setLocation}
              disabled={!siteId || locationsQuery.isLoading || !!locationsQuery.error}
            >
              <SelectTrigger id="location">
                <SelectValue
                  placeholder={
                    !siteId
                      ? "Selecione um site padrão em Configurações"
                      : locationsQuery.isLoading
                      ? "Carregando regras..."
                      : locationsQuery.error
                        ? "Falha ao carregar regras"
                        : "Selecione uma regra"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sortedLocations.map((l) => (
                  <SelectItem key={l.locationId} value={l.locationId}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {locationId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => membersQuery.refetch()}
              disabled={membersQuery.isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${membersQuery.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
        {locationsQuery.error && (
          <p className="mt-2 text-sm text-destructive">{(locationsQuery.error as Error).message}</p>
        )}
      </Card>

      {!locationId ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Selecione uma regra acima para listar seus membros.
        </Card>
      ) : (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {selectedLocation?.name ?? "Membros"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {membersQuery.isLoading
                ? "Carregando..."
                : `${membersQuery.data?.length ?? approverIds.length} membro(s)`}
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
                    const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
                    const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
                    return an.localeCompare(bn, "pt-BR", { sensitivity: "base" });
                  })
                  .map((m) => (
                    <TableRow key={m.identityId} className="cursor-pointer" onClick={() => openView(m.identityId)}>
                      <TableCell>
                        <IdentityThumb identityId={m.identityId} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {`${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.email ?? "—"}
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
                            {m.email && (
                              <DropdownMenuItem asChild>
                                <a href={`mailto:${m.email}`}>
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