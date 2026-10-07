import { auditDelete } from "@/lib/audit";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProfile } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import type { Company } from "@/components/CompanyForm";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/empresas/")({
  head: () => ({ meta: [{ title: "Empresas — Argus ClearID" }] }),
  component: EmpresasPage,
});

function EmpresasPage() {
  const { t } = useT();
  const activeProfile = useActiveProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Company | null>(null);

  // Empresas do CLIENTE ativo — cada empresa pertence a um cliente (perfil).
  const query = useQuery({
    queryKey: ["companies", activeProfile],
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("profile", activeProfile)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, id) => {
      auditDelete("company", id, toDelete?.name, "a empresa", { taxId: toDelete?.tax_id ?? null });
      toast.success(t("companies.toast.deleted"));
      qc.invalidateQueries({ queryKey: ["companies"] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("companies.title")}
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("shell.profile")}: {activeProfile}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("companies.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {t("companies.refreshButton")}
          </Button>
          <Button size="sm" onClick={() => navigate({ to: "/empresas/nova" })}>
            <Plus className="mr-1 h-4 w-4" /> {t("companies.newButton")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data
              ? items.length === 1
                ? t("companies.count.one", { count: items.length })
                : t("companies.count.other", { count: items.length })
              : t("companies.title")}
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
              {(query.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("companies.emptyState")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("companies.col.legalName")}</TableHead>
                  <TableHead>{t("companies.col.taxId")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link to="/empresas/$id" params={{ id: c.id }} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.legal_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.tax_id ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "Active" ? "default" : "secondary"}>
                        {c.status === "Active" ? t("companies.status.active") : t("companies.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link to="/empresas/$id" params={{ id: c.id }} aria-label={t("companies.page.editTitle")}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToDelete(c)}
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

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.delete.confirmBefore")}
              <span className="font-medium">{toDelete?.name}</span>
              {t("companies.delete.confirmAfter")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? t("companies.delete.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
