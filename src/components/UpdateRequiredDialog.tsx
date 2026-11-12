// Bloqueia o uso de uma aba que ficou com a versão antiga do sistema: a única
// saída é recarregar a página, que passa a rodar a versão publicada.
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useNewVersionAvailable } from "@/lib/app-version";
import { useT } from "@/lib/i18n";

export function UpdateRequiredDialog() {
  const { t } = useT();
  const outdated = useNewVersionAvailable();
  if (!outdated) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("updateRequired.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("updateRequired.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" onClick={() => window.location.reload()}>
            {t("updateRequired.reload")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
