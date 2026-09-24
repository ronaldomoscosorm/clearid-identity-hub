// Helpers de tipos de trabalhador.

export type WorkerTypeLike = {
  id: string;
  name?: string | null;
  code?: string | null;
  argus_worker_type_code?: string | null;
};

/**
 * Identifica o tipo MATRIZ (Colaborador), do qual os demais tipos herdam os
 * campos do cliente.
 *
 * Ordem: nome EXATO "colaborador" → nome contendo "colaborador" → código Argus
 * "Colaborador" → código "COL". O nome vem primeiro porque o código Argus pode
 * se repetir entre tipos (ex.: Terceirizados e Entregador-Motorista também com
 * "Colaborador"), e um `find` pelo código pegaria o primeiro da lista — um tipo
 * sem linhas —, quebrando a herança (campos caindo no catálogo).
 */
export function findColaboradorId<T extends WorkerTypeLike>(types: T[]): string | null {
  const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  return (
    types.find((w) => lc(w.name) === "colaborador")?.id ??
    types.find((w) => lc(w.name).includes("colaborador"))?.id ??
    types.find((w) => w.argus_worker_type_code === "Colaborador")?.id ??
    types.find((w) => (w.code ?? "").toUpperCase() === "COL")?.id ??
    null
  );
}
