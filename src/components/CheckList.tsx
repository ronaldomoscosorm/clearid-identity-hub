import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { matchesSearch } from "@/lib/text-search";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Lista de opções com caixas de seleção (múltipla escolha) e atalho "Todos". */
export function CheckList({
  label,
  options,
  selected,
  onChange,
  allLabel,
  selectedLabel,
  searchPlaceholder,
  noMatchLabel,
  loading,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel: string;
  selectedLabel: (n: number) => string;
  searchPlaceholder: string;
  noMatchLabel: string;
  loading?: boolean;
}) {
  const allChecked = selected.size === 0;
  const [search, setSearch] = useState("");
  // Filtro por texto dentro da lista (sem acentos). Os já marcados continuam marcados mesmo fora do filtro.
  const visible = useMemo(
    () => options.filter((o) => matchesSearch(search, o.label, o.value)),
    [options, search],
  );
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {allChecked ? allLabel : selectedLabel(selected.size)}
        </span>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-8 pl-8 pr-8 text-sm"
          disabled={loading}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="×"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ScrollArea className="h-40 rounded-md border p-2">
        {loading ? (
          <p className="p-2 text-xs text-muted-foreground">…</p>
        ) : (
          <div className="space-y-1.5">
            {!search && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={allChecked} onCheckedChange={() => onChange(new Set())} />
                <span className="font-medium">{allLabel}</span>
              </label>
            )}
            {visible.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {search && visible.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">{noMatchLabel}</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
