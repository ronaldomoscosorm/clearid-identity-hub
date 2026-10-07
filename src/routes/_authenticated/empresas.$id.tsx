import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { CompanyForm, type Company } from "@/components/CompanyForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/empresas/$id")({
  head: () => ({ meta: [{ title: "Editar empresa — Argus ClearID" }] }),
  component: EditarEmpresaPage,
});

function EditarEmpresaPage() {
  const { t } = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const back = () => navigate({ to: "/empresas" });

  const query = useQuery({
    queryKey: ["company", id],
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const company = query.data ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/empresas">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("companies.page.back")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {company?.name || t("companies.page.editTitle")}
          </h1>
          {company && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("shell.profile")}: {company.profile}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("companies.dialog.editDescription")}</p>
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : !company ? (
        <p className="rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          {t("companies.page.notFound")}
        </p>
      ) : (
        <CompanyForm company={company} profile={company.profile} onSaved={back} onCancel={back} />
      )}
    </div>
  );
}
