// Confirmação ao cadastrar uma pessoa num site diferente do site padrão do
// operador. Mostra a regra que a pessoa vai receber (a General Access do site
// escolhido) ou pede a escolha quando não há uma candidata única.
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DefaultRule, DefaultRuleResolution } from "@/lib/default-rule";
import { useT } from "@/lib/i18n";

export function SiteMismatchDialog({
  personName,
  siteName,
  ownSiteName,
  resolution,
  onConfirm,
  onCancel,
}: {
  personName: string;
  siteName: string;
  ownSiteName: string;
  resolution: DefaultRuleResolution;
  /** `null` = nenhuma regra será atribuída automaticamente. */
  onConfirm: (rule: DefaultRule | null) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [ruleId, setRuleId] = useState("");
  const candidates =
    resolution.kind === "choose"
      ? resolution.candidates
          .slice()
          .sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" }),
          )
      : [];
  const fixedRule =
    resolution.kind === "site" || resolution.kind === "own" ? resolution.rule : null;
  const chosen = candidates.find((c) => c.teamId === ruleId);
  const mustChoose = resolution.kind === "choose" && candidates.length > 0;

  const confirm = () => {
    if (fixedRule) onConfirm(fixedRule);
    else onConfirm(chosen ? { ruleId: chosen.teamId, ruleName: chosen.name } : null);
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("siteMismatch.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("siteMismatch.description", {
              name: personName,
              site: siteName,
              ownSite: ownSiteName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {fixedRule && (
          <p className="text-sm text-foreground">
            {t("siteMismatch.rule", { rule: fixedRule.ruleName ?? fixedRule.ruleId })}
          </p>
        )}
        {mustChoose && (
          <div className="space-y-2">
            <Label htmlFor="sm-rule">{t("siteMismatch.chooseRule")}</Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger id="sm-rule">
                <SelectValue placeholder={t("settings.rule.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.teamId} value={c.teamId}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!fixedRule && !mustChoose && (
          <p className="text-sm text-amber-600 dark:text-amber-500">{t("siteMismatch.noRule")}</p>
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("siteMismatch.cancel")}
          </Button>
          <Button type="button" onClick={confirm} disabled={mustChoose && !chosen}>
            {t("siteMismatch.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
