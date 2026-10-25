import { useEffect, useMemo, useState } from "react";
import { addMonths, addYears, format, isValid, parse } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

const LOCALES = { "pt-BR": ptBR, "en-US": enUS, "es-ES": es } as const;
const MIN_YEAR = 1950;
const MAX_YEARS_AHEAD = 15;

/** Aplica a máscara dd/mm/aaaa a partir dos dígitos digitados. */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte dd/mm/aaaa completo em yyyy-MM-dd; null quando incompleto ou inválido. */
function parseMasked(text: string): string | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
  const d = parse(text, "dd/MM/yyyy", new Date());
  if (!isValid(d)) return null;
  const y = d.getFullYear();
  if (y < MIN_YEAR || y > new Date().getFullYear() + MAX_YEARS_AHEAD) return null;
  return format(d, "yyyy-MM-dd");
}

/**
 * Campo de data: digitação direta com máscara dd/mm/aaaa, calendário com seletores de
 * mês/ano e atalhos de prazo (hoje, +6 meses, +1 ano, +2 anos). Sem valor, mostra o
 * placeholder; com valor vencido, o selo "Vencida"; o X limpa o valor.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  disabled = false,
  trackExpiration = true,
  showExpiredHint = true,
  inputClassName,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Destaca em vermelho, com o selo "Vencida", datas anteriores a hoje. */
  trackExpiration?: boolean;
  /** Mostra o texto "Data vencida" abaixo do campo quando vencida. */
  showExpiredHint?: boolean;
  inputClassName?: string;
  className?: string;
}) {
  const { t, lang } = useT();
  const locale = LOCALES[lang] ?? ptBR;
  const iso = toIsoDate(value);
  const selected = iso ? parse(iso, "yyyy-MM-dd", new Date()) : undefined;
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const isExpired = trackExpiration && !!selected && selected < today;

  // Texto digitado; segue o valor externo sempre que ele muda.
  const [text, setText] = useState(selected ? format(selected, "dd/MM/yyyy") : "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(selected ? format(selected, "dd/MM/yyyy") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  const commitText = (masked: string) => {
    setText(masked);
    if (masked === "") {
      if (iso) onChange("");
      return;
    }
    const parsed = parseMasked(masked);
    if (parsed && parsed !== iso) onChange(parsed);
  };

  const onBlur = () => {
    // Incompleto ou inválido ao sair: volta ao último valor válido (ou vazio).
    if (text !== "" && !parseMasked(text)) setText(selected ? format(selected, "dd/MM/yyyy") : "");
  };

  const pick = (d: Date | undefined) => {
    onChange(d ? format(d, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  const shortcuts: { label: string; date: Date }[] = [
    { label: t("identityForm.dateToday"), date: today },
    { label: t("identityForm.datePlus6m"), date: addMonths(today, 6) },
    { label: t("identityForm.datePlus1y"), date: addYears(today, 1) },
    { label: t("identityForm.datePlus2y"), date: addYears(today, 2) },
  ];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Input
            id={id}
            value={text}
            onChange={(e) => commitText(maskDate(e.target.value))}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={t("identityForm.datePlaceholder")}
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            className={cn(
              isExpired && "border-destructive bg-destructive/10 pr-20 text-destructive",
              inputClassName,
            )}
          />
          {isExpired && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
              {t("identityForm.expiredBadge")}
            </span>
          )}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              className="h-9 w-9 shrink-0"
              title={t("identityForm.openCalendar")}
              aria-label={t("identityForm.openCalendar")}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="flex flex-wrap gap-1 border-b p-2">
              {shortcuts.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => pick(s.date)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="single"
              locale={locale}
              captionLayout="dropdown"
              startMonth={new Date(MIN_YEAR, 0)}
              endMonth={new Date(today.getFullYear() + MAX_YEARS_AHEAD, 11)}
              defaultMonth={selected ?? today}
              selected={selected}
              onSelect={pick}
              formatters={{ formatMonthDropdown: (d) => format(d, "MMM", { locale }) }}
              className="pointer-events-auto p-3"
            />
            {selected && !disabled && (
              <div className="border-t p-2">
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => pick(undefined)}>
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
      {isExpired && showExpiredHint && (
        <p className="text-xs font-medium text-destructive">{t("identityForm.expiredDate")}</p>
      )}
    </div>
  );
}
