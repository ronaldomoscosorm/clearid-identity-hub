import { auditSave } from "@/lib/audit";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useT, type TFn } from "@/lib/i18n";
import { typeOf, pickLang, optionsOf, isTruthy } from "@/lib/custom-fields";
import { useSpecialFields } from "@/lib/special-fields";
import {
  listCompanyCurrentAttachmentDefinitions,
  uploadCompanyAttachmentVersion,
} from "@/lib/attachments";
import { AttachmentField } from "@/components/AttachmentField";
import { DatePickerField, toIsoDate } from "@/components/DatePickerField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Company = Database["public"]["Tables"]["companies"]["Row"];

type SiteField = {
  id: string;
  is_required: boolean;
  value_range: Json | null;
  display_name_override: Json | null;
  definition: {
    id: string;
    custom_field_name: string;
    display_name: Json | null;
    custom_field_type: string | null;
    expiration_enabled: boolean;
    attachment_enabled: boolean;
    attachment_required: boolean;
    attachment_accept: string | null;
  } | null;
};

type FormState = {
  name: string;
  legal_name: string;
  tax_id: string;
  description: string;
  status: string;
};

const EMPTY_FORM: FormState = { name: "", legal_name: "", tax_id: "", description: "", status: "Active" };

function toForm(c: Company): FormState {
  return {
    name: c.name ?? "",
    legal_name: c.legal_name ?? "",
    tax_id: c.tax_id ?? "",
    description: c.description ?? "",
    status: c.status ?? "Active",
  };
}

function fieldLabel(sf: SiteField, t: TFn): string {
  return (
    pickLang(sf.display_name_override) ||
    pickLang(sf.definition?.display_name ?? null) ||
    sf.definition?.custom_field_name ||
    t("companies.customField.fallback")
  );
}

/** Dias até a data (negativo = já passou). */
function daysUntil(value: string): number | null {
  const iso = toIsoDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Situação da validade de uma certidão (campo de data com vencimento ligado). */
function ValidityBadge({ value, t }: { value: string; t: TFn }) {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-destructive/50 text-destructive">
        {t("companies.validity.expired", { days: -days })}
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
        {t("companies.validity.expiresIn", { days })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">
      {t("companies.validity.valid")}
    </Badge>
  );
}

/**
 * Formulário completo de empresa (dados básicos + campos adicionais do cliente,
 * como certidões com validade e arquivo comprobatório). Usado nas páginas de
 * cadastro e edição.
 */
export function CompanyForm({
  company,
  profile,
  onSaved,
  onCancel,
}: {
  company: Company | null;
  profile: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  // Dropdowns especiais (Campos personalizados → "campo especial"): mesmas opções
  // value/label usadas no cadastro de identity. Prevalecem sobre o tipo do campo.
  const { byName: specialByName, labelByName: specialLabelByName } = useSpecialFields();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(company ? toForm(company) : EMPTY_FORM);
  // Valores começam VAZIOS: só o que já está gravado para a empresa é carregado.
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [stagedFiles, setStagedFiles] = useState<Record<string, File | null>>({});
  const [existingAttachments, setExistingAttachments] = useState<Set<string>>(new Set());

  const siteFieldsQuery = useQuery({
    queryKey: ["site-custom-fields-active", profile],
    queryFn: async (): Promise<SiteField[]> => {
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "id, is_required, value_range, display_name_override, definition:custom_field_definitions(id, custom_field_name, display_name, custom_field_type, expiration_enabled, attachment_enabled, attachment_required, attachment_accept)",
        )
        .eq("profile", profile)
        .eq("entity_type", "company")
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false })
        .returns<SiteField[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(profile),
  });
  const siteFields = siteFieldsQuery.data ?? [];

  // Edição: carrega os valores gravados e quais certidões já têm arquivo.
  useEffect(() => {
    setForm(company ? toForm(company) : EMPTY_FORM);
    setCustomValues({});
    setStagedFiles({});
    setExistingAttachments(new Set());
    if (!company) return;
    let alive = true;
    supabase
      .from("company_custom_fields")
      .select("site_custom_field_id, value")
      .eq("company_id", company.id)
      .then(({ data }) => {
        if (!alive) return;
        setCustomValues(Object.fromEntries((data ?? []).map((r) => [r.site_custom_field_id, r.value ?? ""])));
      });
    listCompanyCurrentAttachmentDefinitions(company.id)
      .then((s) => alive && setExistingAttachments(s))
      .catch(() => alive && setExistingAttachments(new Set()));
    return () => {
      alive = false;
    };
  }, [company]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        tax_id: form.tax_id.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
      };
      let companyId = company?.id;
      if (company) {
        const { error } = await supabase.from("companies").update(payload).eq("id", company.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("companies")
          .insert({ ...payload, profile })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        companyId = data.id;
      }

      if (companyId && siteFields.length) {
        const rows = siteFields.map((sf) => ({
          company_id: companyId as string,
          site_custom_field_id: sf.id,
          value: customValues[sf.id]?.trim() ? customValues[sf.id].trim() : null,
        }));
        const { error } = await supabase
          .from("company_custom_fields")
          .upsert(rows, { onConflict: "company_id,site_custom_field_id" });
        if (error) throw new Error(error.message);
      }

      // Arquivos das certidões (nova versão por campo). Falha de um arquivo não
      // desfaz a empresa: é reportada ao final.
      let failedUploads = 0;
      if (companyId) {
        for (const [definitionId, file] of Object.entries(stagedFiles)) {
          if (!file) continue;
          try {
            await uploadCompanyAttachmentVersion(companyId, definitionId, file);
          } catch (e) {
            console.error("[empresas] falha ao enviar certidão:", (e as Error).message);
            failedUploads++;
          }
        }
      }
      return { failedUploads, companyId };
    },
    onSuccess: ({ failedUploads, companyId }) => {
      auditSave(company, "company", companyId, form.name.trim(), "a empresa", {
        taxId: form.tax_id.trim() || null,
        status: form.status,
        certificates: Object.keys(stagedFiles).filter((k) => stagedFiles[k]).length,
      });
      if (failedUploads > 0) toast.warning(t("companies.toast.attachmentFailed", { count: failedUploads }));
      else toast.success(company ? t("companies.toast.updated") : t("companies.toast.created"));
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company"] });
      qc.invalidateQueries({ queryKey: ["company-attachments"] });
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t("companies.validation.nameRequired"));
      return;
    }
    const missing = siteFields.find((sf) => sf.is_required && !customValues[sf.id]?.trim());
    if (missing) {
      toast.error(t("companies.validation.requiredField", { field: fieldLabel(missing, t) }));
      return;
    }
    const missingFile = siteFields.find((sf) => {
      const def = sf.definition;
      if (!def?.attachment_enabled || !def.attachment_required) return false;
      return !stagedFiles[def.id] && !existingAttachments.has(def.id);
    });
    if (missingFile) {
      toast.error(t("companies.validation.attachmentRequired", { field: fieldLabel(missingFile, t) }));
      return;
    }
    save.mutate();
  };

  const setCV = (id: string, v: string) => setCustomValues((c) => ({ ...c, [id]: v }));
  const busy = save.isPending;

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> {t("companies.section.data")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t("companies.form.name")}</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("companies.form.namePlaceholder")}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal_name">{t("companies.col.legalName")}</Label>
            <Input
              id="legal_name"
              value={form.legal_name}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax_id">{t("companies.col.taxId")}</Label>
            <Input
              id="tax_id"
              value={form.tax_id}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
              placeholder="00.000.000/0000-00"
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t("common.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))} disabled={busy}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">{t("companies.status.active")}</SelectItem>
                <SelectItem value="Inactive">{t("companies.status.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">{t("companies.form.description")}</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              disabled={busy}
            />
          </div>
        </CardContent>
      </Card>

      {siteFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4" /> {t("companies.customField.section")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {siteFields.map((sf) => {
              const special = sf.definition ? specialByName.get(sf.definition.custom_field_name) : undefined;
              const kind = special?.length ? "list" : typeOf(sf.definition?.custom_field_type);
              const value = customValues[sf.id] ?? "";
              const label =
                (sf.definition && specialLabelByName.get(sf.definition.custom_field_name)) || fieldLabel(sf, t);
              const def = sf.definition;
              return (
                <div key={sf.id} className="space-y-2 rounded-md border p-3">
                  <Label htmlFor={`cf-${sf.id}`} className="flex flex-wrap items-center gap-2">
                    <span>
                      {label}
                      {sf.is_required && <span className="ml-0.5 text-destructive">*</span>}
                    </span>
                    {kind === "date" && def?.expiration_enabled !== false && <ValidityBadge value={value} t={t} />}
                  </Label>
                  {kind === "boolean" ? (
                    <div className="flex h-9 items-center">
                      <Checkbox
                        id={`cf-${sf.id}`}
                        checked={isTruthy(value)}
                        onCheckedChange={(c) => setCV(sf.id, c ? "true" : "false")}
                        disabled={busy}
                      />
                    </div>
                  ) : kind === "list" ? (
                    <Select value={value} onValueChange={(v) => setCV(sf.id, v)} disabled={busy}>
                      <SelectTrigger id={`cf-${sf.id}`}>
                        <SelectValue placeholder={t("companies.customField.selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {special?.length
                          ? special.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))
                          : optionsOf(sf.value_range).map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  ) : kind === "date" ? (
                    <DatePickerField
                      id={`cf-${sf.id}`}
                      value={value}
                      onChange={(v) => setCV(sf.id, v)}
                      disabled={busy}
                      trackExpiration={false}
                    />
                  ) : (
                    <Input
                      id={`cf-${sf.id}`}
                      type={kind === "number" ? "number" : "text"}
                      value={value}
                      onChange={(e) => setCV(sf.id, e.target.value)}
                      disabled={busy}
                    />
                  )}
                  {def?.attachment_enabled && (
                    <AttachmentField
                      definitionId={def.id}
                      identityDbId={null}
                      companyId={company?.id ?? null}
                      label={t("attachment.evidenceLabel")}
                      required={def.attachment_required}
                      accept={def.attachment_accept}
                      disabled={busy}
                      staged={stagedFiles[def.id] ?? null}
                      onStage={(file) => setStagedFiles((m) => ({ ...m, [def.id]: file }))}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {busy ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
