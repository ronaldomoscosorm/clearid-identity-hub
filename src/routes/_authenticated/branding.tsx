import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, RotateCcw, Sun, Moon, ShieldCheck } from "lucide-react";
import { useActiveProfile } from "@/lib/argus-client";
import { useCurrentUser, isAdmin } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getBranding,
  saveBranding,
  resetBranding,
  applyBranding,
  hasOwnBranding,
  saveClientBranding,
  useClientBranding,
  DEFAULT_BRANDING,
  type BrandingConfig,
} from "@/lib/branding";
import { PoweredBy } from "@/components/PoweredBy";
import { pushSettings } from "@/lib/supabase-settings";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/branding")({
  head: () => ({ meta: [{ title: "Identidade Visual — Argus ClearID" }] }),
  component: BrandingPage,
});

function BrandingPage() {
  const { t } = useT();
  const activeProfile = useActiveProfile();
  const { data: currentUser } = useCurrentUser();
  const admin = isAdmin(currentUser);
  // Configuração BÁSICA do cliente (definida pelo administrador).
  const clientBranding = useClientBranding(activeProfile);
  const [cfg, setCfg] = useState<BrandingConfig>(() => getBranding());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const fileRef = useRef<HTMLInputElement>(null);
  const [savingClient, setSavingClient] = useState(false);

  // Sem configuração própria, o formulário parte da básica do cliente quando
  // ela carrega (é o que o usuário vê ao logar).
  useEffect(() => {
    if (clientBranding.data && !hasOwnBranding()) setCfg(clientBranding.data);
  }, [clientBranding.data]);

  // Administrador: grava a configuração atual como BÁSICA do cliente.
  const handleSaveAsClientDefault = async () => {
    if (!admin) return;
    setSavingClient(true);
    try {
      await saveClientBranding(activeProfile, cfg, currentUser?.username ?? null);
      await clientBranding.refetch();
      toast.success(t("branding.toast.clientSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingClient(false);
    }
  };

  const changeTheme = (v: Theme) => {
    setThemeState(v);
    setTheme(v); // aplica e persiste imediatamente
  };

  const update = (patch: Partial<BrandingConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const onPickLogo = (file: File) => {
    if (file.size > 1024 * 1024) {
      toast.error(t("branding.toast.logoTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ clientLogo: String(reader.result ?? "") });
    reader.onerror = () => toast.error(t("branding.toast.readError"));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    saveBranding(cfg);
    applyBranding(cfg);
    pushSettings()
      .then(() => toast.success(t("branding.toast.applied")))
      .catch(() => toast.warning(t("branding.toast.syncFail")));
  };

  // Restaurar = descarta a configuração PRÓPRIA e volta à básica do cliente
  // (se houver); sem básica, cai no padrão R&M.
  const handleReset = () => {
    resetBranding();
    const fallback = clientBranding.data ?? DEFAULT_BRANDING;
    setCfg(fallback);
    applyBranding(fallback);
    void pushSettings();
    toast.success(t("branding.toast.restored"));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("branding.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("branding.subtitle")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("branding.client.title")}</CardTitle>
            <CardDescription>
              {t("branding.client.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">{t("branding.client.nameLabel")}</Label>
              <Input
                id="clientName"
                value={cfg.clientName}
                onChange={(e) => update({ clientName: e.target.value })}
                placeholder={t("branding.client.namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("branding.logo.label")}</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-card">
                  {cfg.clientLogo ? (
                    <img
                      src={cfg.clientLogo}
                      alt={t("branding.logo.alt")}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{t("branding.logo.none")}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t("branding.logo.upload")}
                  </Button>
                  {cfg.clientLogo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ clientLogo: "" })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("common.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("branding.logo.hint")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("branding.colors.title")}</CardTitle>
            <CardDescription>
              {t("branding.colors.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("branding.theme.label")}</Label>
              <div className="inline-flex rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => changeTheme("light")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    theme === "light" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sun className="h-4 w-4" /> {t("branding.theme.light")}
                </button>
                <button
                  type="button"
                  onClick={() => changeTheme("dark")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    theme === "dark" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Moon className="h-4 w-4" /> {t("branding.theme.dark")}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primary">{t("branding.colors.primaryLabel")}</Label>
              <div className="flex items-center gap-3">
                <input
                  id="primary"
                  type="color"
                  value={cfg.primaryColor}
                  onChange={(e) => update({ primaryColor: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded border bg-card"
                />
                <Input
                  value={cfg.primaryColor}
                  onChange={(e) => update({ primaryColor: e.target.value })}
                  placeholder="#1e3a5f"
                />
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">{t("branding.preview.label")}</div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: cfg.primaryColor }}
                >
                  {t("branding.preview.primaryButton")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={handleReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t("branding.resetButton")}
        </Button>
        {admin && (
          <Button variant="secondary" onClick={handleSaveAsClientDefault} disabled={savingClient}>
            <ShieldCheck className="mr-1 h-4 w-4" />
            {savingClient ? t("common.saving") : t("branding.clientDefaultButton")}
          </Button>
        )}
        <Button onClick={handleSave}>{t("branding.saveButton")}</Button>
      </div>

      <PoweredBy />
    </div>
  );
}