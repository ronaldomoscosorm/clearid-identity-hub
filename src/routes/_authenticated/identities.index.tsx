import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { argusApi } from "@/lib/argus-client";
import { useArgusEnv } from "@/lib/argus-env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/identities")({
  head: () => ({ meta: [{ title: "Identities — Argus ClearID" }] }),
  component: IdentitiesList,
});

function IdentitiesList() {
  const { env } = useArgusEnv();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const query = useQuery({
    queryKey: ["identities", env, search, status],
    queryFn: () =>
      argusApi.listIdentities({
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Identities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastros sincronizados com o Identity Service v4 do ClearID.
          </p>
        </div>
        <Button asChild>
          <Link to="/identities/new">
            <Plus className="mr-1 h-4 w-4" /> Nova identity
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou externalId..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="Active">Ativos</SelectItem>
              <SelectItem value="Inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ExternalId</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Atualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-destructive">
                  {(query.error as Error).message}
                </TableCell>
              </TableRow>
            ) : !query.data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma identity encontrada.
                </TableCell>
              </TableRow>
            ) : (
              query.data.items.map((it) => (
                <TableRow key={it.id ?? it.externalId} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/identities/$id"
                      params={{ id: it.id ?? it.externalId }}
                      className="hover:underline"
                    >
                      {it.externalId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {it.firstName} {it.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it.email}</TableCell>
                  <TableCell>
                    <Badge variant={it.status === "Active" ? "default" : "secondary"}>
                      {it.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}