// Linha informativa sob o campo Site do cadastro: mostra a regra que a pessoa
// vai receber ao salvar e avisa quando o site difere do site padrão do operador.
import { useDefaultRuleForSite } from "@/lib/default-rule";
import { useT } from "@/lib/i18n";

export function DefaultRuleHint({
  profile,
  siteId,
  siteName,
}: {
  profile: string;
  siteId: string;
  siteName?: string | null;
}) {
  const { t } = useT();
  const { differs, ownSiteName, resolution } = useDefaultRuleForSite(profile, siteId, siteName);
  if (!siteId || !resolution) return null;

  const rule =
    resolution.kind === "own" || resolution.kind === "site" ? resolution.rule.ruleName : null;
  if (!differs && !rule) return null;

  return (
    <p className="text-xs text-muted-foreground">
      {differs && (
        <span className="font-medium text-amber-600 dark:text-amber-500">
          {t("defaultRule.hint.otherSite", { site: ownSiteName ?? "—" })}{" "}
        </span>
      )}
      {rule
        ? t("defaultRule.hint.rule", { rule })
        : resolution.kind === "choose"
          ? t("defaultRule.hint.choose")
          : null}
    </p>
  );
}
