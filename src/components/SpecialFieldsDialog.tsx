import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSpecialFields, type DropdownOption } from "@/lib/special-fields";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldDef = { customFieldName: string; displayName?: string | null };
type Draft = { custom_field_name: string; label: string; options: DropdownOption[] };

export function SpecialFieldsDialog({
  open,
  onOpenChange,
  fields,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fields: FieldDef[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const { list } = useSpecialFields();
  const [draft, setDraft] = useState<Draft | null>(null);

  const labelOfField = (name: string) =>
    fields.find((f) => f.customFieldName === name)?.displayName || name;

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const options = d.options
        .map((o) => ({ value: o.value.trim(), label: o.label.trim() || o.value.trim() }))
        .filter((o) => o.value);
      const { error } = await supabase
        .from("special_custom_fields")
        .upsert(
          {
            custom_field_name: d.custom_field_name,
            label: d.label.trim() || null,
            options: options as unknown as Json,
          },
          { onConflict: "custom_field_name" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("specialFields.saved"));
      qc.invalidateQueries({ queryKey: ["special-custom-fields"] });
      setDraft(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("special_custom_fields")
        .delete()
        .eq("custom_field_name", name);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("specialFields.removed"));
      qc.invalidateQueries({ queryKey: ["special-custom-fields"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startNew = () => setDraft({ custom_field_name: "", label: "", options: [{ value: "", label: "" }] });
  const setOption = (i: number, patch: Partial<DropdownOption>) =>
    setDraft((d) => (d ? { ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) } : d));
  const addOption = () => setDraft((d) => (d ? { ...d, options: [...d.options, { value: "", label: "" }] } : d));
  const removeOption = (i: number) =>
    setDraft((d) => (d ? { ...d, options: d.options.filter((_, j) => j !== i) } : d));

  const canSave =
    !!draft &&
    !!draft.custom_field_name &&
    !!draft.label.trim() &&
    draft.options.some((o) => o.value.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDraft(null); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("specialFields.title")}</DialogTitle>
          <DialogDescription>{t("specialFields.subtitle")}</DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={startNew}>
                <Plus className="mr-1 h-4 w-4" /> {t("specialFields.new")}
              </Button>
            </div>
            {list.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("specialFields.empty")}</p>
            ) : (
              <div className="divide-y rounded-md border">
                {list.map((s) => (
                  <div key={s.custom_field_name} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.label || labelOfField(s.custom_field_name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {labelOfField(s.custom_field_name)} · {t("specialFields.optionCount", { count: s.options.length })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("common.edit")}
                      onClick={() => setDraft({ custom_field_name: s.custom_field_name, label: s.label, options: s.options.length ? s.options : [{ value: "", label: "" }] })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      title={t("common.delete")}
                      onClick={() => remove.mutate(s.custom_field_name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("specialFields.label")}</Label>
              <Input
                value={draft.label}
                placeholder={t("specialFields.labelPlaceholder")}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("specialFields.field")}</Label>
              <Select
                value={draft.custom_field_name}
                onValueChange={(v) => setDraft({ ...draft, custom_field_name: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("specialFields.fieldPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.customFieldName} value={f.customFieldName}>
                      {f.displayName || f.customFieldName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                <span>{t("specialFields.optionLabel")}</span>
                <span>{t("specialFields.optionValue")}</span>
                <span />
              </div>
              {draft.options.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input
                    value={o.label}
                    placeholder={t("specialFields.optionLabelPlaceholder")}
                    onChange={(e) => setOption(i, { label: e.target.value })}
                  />
                  <Input
                    value={o.value}
                    placeholder={t("specialFields.optionValuePlaceholder")}
                    onChange={(e) => setOption(i, { value: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeOption(i)}
                    disabled={draft.options.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-1 h-4 w-4" /> {t("specialFields.addOption")}
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => save.mutate(draft)} disabled={!canSave || save.isPending}>
                {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
