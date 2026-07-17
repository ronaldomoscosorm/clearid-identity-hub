import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  STANDARD_IDENTITY_FIELDS,
  useIdentityFieldLabels,
} from "@/lib/identity-labels";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/layout-formulario")({
  head: () => ({ meta: [{ title: "Layout do formulário — Argus ClearID" }] }),
  component: LayoutFormularioPage,
});

// Rótulo i18n de fallback por campo (quando não há apelido cadastrado).
const LABEL_KEY: Record<string, string> = {
  company_worker_type_code: "identityForm.workerType",
  first_name: "common.name",
  last_name: "identityForm.lastName",
  display_name: "identityForm.displayName",
  email: "common.email",
  company_site_id: "identityForm.site",
  company_id: "identityForm.company",
};
const REQUIRED = new Set(STANDARD_IDENTITY_FIELDS.filter((f) => f.required).map((f) => f.key));

type Columns = { available: string[]; form: string[] };

function LayoutFormularioPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { alias, isVisible, orderKeys, loaded } = useIdentityFieldLabels();

  const labelOf = (key: string) => alias(key, t(LABEL_KEY[key] ?? `identityForm.extra.${key}`));

  const [cols, setCols] = useState<Columns>({ available: [], form: [] });

  // Inicializa as colunas a partir da config atual (ordem + visibilidade).
  useEffect(() => {
    if (!loaded) return;
    const ordered = orderKeys(STANDARD_IDENTITY_FIELDS.map((f) => f.key));
    const form = ordered.filter((k) => REQUIRED.has(k) || isVisible(k));
    const available = ordered.filter((k) => !REQUIRED.has(k) && !isVisible(k));
    setCols({ available, form });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const containerOf = (id: string): keyof Columns | null => {
    if (id === "available" || id === "form") return id;
    if (cols.available.includes(id)) return "available";
    if (cols.form.includes(id)) return "form";
    return null;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const from = containerOf(activeId);
    let to = containerOf(overId);
    if (!from || !to) return;

    // Obrigatório não pode sair do formulário.
    if (from === "form" && to === "available" && REQUIRED.has(activeId)) return;

    setCols((prev) => {
      const next: Columns = { available: [...prev.available], form: [...prev.form] };
      if (from === to) {
        const arr = next[from];
        const oldIdx = arr.indexOf(activeId);
        const newIdx = overId === to ? arr.length - 1 : arr.indexOf(overId);
        next[from] = arrayMove(arr, oldIdx, newIdx);
      } else {
        next[from] = next[from].filter((k) => k !== activeId);
        const dest = next[to];
        const insertAt = overId === to ? dest.length : dest.indexOf(overId);
        dest.splice(insertAt < 0 ? dest.length : insertAt, 0, activeId);
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const rows = STANDARD_IDENTITY_FIELDS.map((f) => {
        const inForm = cols.form.includes(f.key);
        const idx = cols.form.indexOf(f.key);
        return {
          field_key: f.key,
          is_visible: inForm,
          display_order: inForm ? idx : null,
        };
      });
      const { error } = await supabase
        .from("identity_field_labels")
        .upsert(rows, { onConflict: "field_key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("formLayout.saved"));
      qc.invalidateQueries({ queryKey: ["identity-field-labels"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("formLayout.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("formLayout.subtitle")}</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            id="available"
            title={t("formLayout.available")}
            hint={t("formLayout.availableHint")}
            items={cols.available}
            labelOf={labelOf}
          />
          <Column
            id="form"
            title={t("formLayout.inForm")}
            hint={t("formLayout.inFormHint")}
            items={cols.form}
            labelOf={labelOf}
          />
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  id,
  title,
  hint,
  items,
  labelOf,
}: {
  id: string;
  title: string;
  hint: string;
  items: string[];
  labelOf: (k: string) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn(
              "min-h-24 space-y-2 rounded-md border border-dashed p-2 transition-colors",
              isOver && "border-primary bg-primary/5",
            )}
          >
            {items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {/* área vazia — arraste campos para cá */}
                &nbsp;
              </p>
            ) : (
              items.map((k) => <FieldItem key={k} id={k} label={labelOf(k)} />)
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  );
}

function FieldItem({ id, label }: { id: string; label: string }) {
  const required = REQUIRED.has(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1">{label}</span>
      {required && (
        <span title="Obrigatório" className="text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
