import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClearIdCustomFieldDef } from "@/lib/argus-client";
import { RefreshCw } from "lucide-react";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { useT } from "@/lib/i18n";
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
  const { t } = useT();
  const query = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    retry: false,
  });

  const items = (query.data ?? []).filter((f) => !f.isDeleted);

  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections"],
    queryFn: () => argusApi.listCustomFieldSections(),
    staleTime: 5 * 60 * 1000,
  });

  // custom_field_name -> nome de exibição da seção.
  const sectionByField = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sectionsQuery.data ?? []) {
      for (const f of sec.fields) m.set(f.name, sec.displayName || sec.sectionName);
    }
    return m;
  }, [sectionsQuery.data]);

  // Agrupa os campos por seção (ordem alfabética de seção e de campo).
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ClearIdCustomFieldDef[]>();
    for (const f of items) {
      const key = sectionByField.get(f.customFieldName) ?? t("customFields.sectionOther");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    const arr = [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }),
    );
    for (const [, fs] of arr) {
      fs.sort((a, b) =>
        (a.displayName || a.customFieldName).localeCompare(
          b.displayName || b.customFieldName,
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
    }
    return arr;
  }, [items, sectionByField, t]);

  // Espelha as definições de campos para o Supabase (cache local, best-effort).
  useEffect(() => {
    if (query.data?.length) void mirrorCustomFieldDefs(query.data);
  }, [query.data]);

  const renderRow = (f: ClearIdCustomFieldDef) => (
    <TableRow key={f.customFieldName}>
      <TableCell className="font-medium">{f.displayName || f.customFieldName}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{f.customFieldName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{f.customFieldType ?? "—"}</Badge>
      </TableCell>
      <TableCell>
        {f.synchronizationEnabled ? (
          <Badge>{t("customFields.syncActive")}</Badge>
        ) : (
          <Badge variant="outline">{t("customFields.syncInactive")}</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {f.isReadOnly ? t("common.yes") : t("common.no")}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(f.lastModificationDateUtc)}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("customFields.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customFields.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {t("customFields.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data
              ? items.length === 1
                ? t("customFields.countSingular", { count: items.length })
                : t("customFields.countPlural", { count: items.length })
              : t("customFields.fieldsLabel")}
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
              {t("customFields.emptyState")}
            </p>
          ) : (
            <div className="space-y-6">
              {groupedItems.map(([section, fields]) => (
                <div key={section} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{section}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("customFields.col.displayName")}</TableHead>
                        <TableHead>{t("customFields.col.identifier")}</TableHead>
                        <TableHead>{t("customFields.col.type")}</TableHead>
                        <TableHead>{t("customFields.col.synchronization")}</TableHead>
                        <TableHead>{t("customFields.col.readOnly")}</TableHead>
                        <TableHead>{t("customFields.col.lastModified")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{fields.map(renderRow)}</TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}