import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Normaliza um valor de data (ISO ou yyyy-MM-dd) para yyyy-MM-dd; "" quando vazio/sentinela. */
export function toIsoDate(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  const iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  if (iso) {
    if (iso.startsWith("0001-") || iso === "1900-01-01" || iso === "1970-01-01") return "";
    return iso;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const out = d.toISOString().slice(0, 10);
  return out.startsWith("0001-") ? "" : out;
}

/**
 * Seletor de data (Popover + Calendário) no lugar de <input type="date">: o input
 * nativo do Safari mostra a data de hoje quando vazio, parecendo preenchido.
 * Sem valor, exibe o placeholder; com valor, permite limpar.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  disabled = false,
  trackExpiration = true,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Destaca em vermelho, com o selo "Vencida", datas anteriores a hoje. */
  trackExpiration?: boolean;
}) {
  const { t } = useT();
  const iso = toIsoDate(value);
  const selected = iso ? parse(iso, "yyyy-MM-dd", new Date()) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isExpired = trackExpiration && !!selected && selected < today;

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selected && "text-muted-foreground",
              isExpired &&
                "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selected ? format(selected, "dd/MM/yyyy", { locale: ptBR }) : t("identityForm.datePlaceholder")}
            {isExpired && (
              <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                {t("identityForm.expiredBadge")}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selected}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
            initialFocus
            className="pointer-events-auto p-3"
          />
          {selected && !disabled && (
            <div className="border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange("")}>
                {t("identityForm.clear")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          title={t("identityForm.clear")}
          aria-label={t("identityForm.clear")}
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
