import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/campos-personalizados")({
  head: () => ({ meta: [{ title: "Campos personalizados — Argus ClearID" }] }),
  component: CustomFieldsPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function CustomFieldsPage() {
  const query = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    retry: false,
  });

  const items = (query.data ?? []).filter((f) => !f.isDeleted);

  // Espelha as definições de campos para o Supabase (cache local, best-effort).
  useEffect(() => {
    if (query.data?.length) void mirrorCustomFieldDefs(query.data);
  }, [query.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Campos personalizados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Definições de campos personalizados disponíveis para as identities.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data ? `${items.length} ${items.length === 1 ? "campo" : "campos"}` : "Campos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : query.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(query.error as ArgusApiError).message}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum campo personalizado encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome de exibição</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Sincronização</TableHead>
                  <TableHead>Somente leitura</TableHead>
                  <TableHead>Última alteração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow key={f.customFieldName}>
                    <TableCell className="font-medium">
                      {f.displayName || f.customFieldName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {f.customFieldName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{f.customFieldType ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {f.synchronizationEnabled ? (
                        <Badge>Ativa</Badge>
                      ) : (
                        <Badge variant="outline">Inativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.isReadOnly ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(f.lastModificationDateUtc)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}