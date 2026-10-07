import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useActiveProfile } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { CompanyForm } from "@/components/CompanyForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/empresas/nova")({
  head: () => ({ meta: [{ title: "Nova empresa — Argus ClearID" }] }),
  component: NovaEmpresaPage,
});

function NovaEmpresaPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const back = () => navigate({ to: "/empresas" });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/empresas">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("companies.page.back")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("companies.newButton")}</h1>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("shell.profile")}: {activeProfile}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t("companies.dialog.createDescription")}</p>
      </div>
      <CompanyForm company={null} profile={activeProfile} onSaved={back} onCancel={back} />
    </div>
  );
}
