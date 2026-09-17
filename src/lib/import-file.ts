// Pré-processamento do arquivo de importação de identities.
//
// O backend de import (POST /api/identities/import) lê o site de cada linha a
// partir da coluna `siteId` da planilha. Para permitir que o operador escolha um
// site único para todo o lote na UI, injetamos/sobrescrevemos essa coluna em
// todas as linhas antes de enviar. Aceita CSV e Excel; o resultado sai sempre
// como CSV (formato aceito pelo backend).

/**
 * Retorna um novo File (CSV) com a coluna `siteId` definida como `siteId` em
 * todas as linhas de dados. Qualquer coluna de site pré-existente (em qualquer
 * caixa: SiteId, siteid…) é substituída, evitando colunas duplicadas.
 */
export async function withSiteId(file: File, siteId: string): Promise<File> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou ilegível.");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) throw new Error("A planilha não contém linhas de dados.");

  const normalized = rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.trim().toLowerCase() === "siteid") continue; // remove site pré-existente
      next[key] = value;
    }
    next.siteId = siteId;
    return next;
  });

  const outWs = XLSX.utils.json_to_sheet(normalized);
  const csv = XLSX.utils.sheet_to_csv(outWs);
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  return new File([csv], `${baseName}.csv`, { type: "text/csv" });
}

/** Mapa de resolução dos sites da Employer → siteId do ClearID. */
export type EmployerSiteMap = {
  byCodigo: Map<string, string>; // código (minúsculo) → site_id
  byNome: Map<string, string>; // nome (minúsculo) → site_id
};

/** Normaliza um header: minúsculo, sem acento, espaços colapsados. */
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

// Colunas da planilha (normalizadas) que identificam o site na Employer.
//   filial  -> Nome (Employer)
//   codigo  -> Código (Employer)
const SITE_NAME_SRC = new Set(
  ["filial", "nome (employer)", "employersitename", "nomesite", "sitename", "nomeemployer"].map(norm),
);
const SITE_CODE_SRC = new Set(
  ["codigo", "codigo (employer)", "employersitecode", "codigosite", "sitecode", "codigoemployer", "cod"].map(norm),
);

// de → para direto: coluna origem (normalizada) → coluna alvo do import ClearID.
const COLUMN_MAP: Record<string, string> = {
  [norm("nome")]: "firstName",
  [norm("Data Admissao")]: "vy_admissao",
  [norm("Inicio Afastamento")]: "vy_iniafastamento",
  [norm("Fim Afastamento")]: "vy_fimafastamento",
};
// Coluna de CPF (origem) → campo customizável vy_cpf (limpo, com zeros à esquerda).
const CPF_SRC = new Set([norm("CPF")]);

/**
 * CPF só com dígitos: remove ".", "-" e espaços, mantendo os zeros à esquerda
 * como significativos. Padroniza em 11 dígitos (restaura zeros perdidos quando a
 * planilha guardou o CPF como número).
 */
function cleanCpf(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 1 && digits.length <= 11 ? digits.padStart(11, "0") : digits;
}

/**
 * Aplica o de→para das colunas da planilha da Employer para o formato do import
 * do ClearID:
 *   - `filial`/`código` → resolve o `siteId` via employer_sites (o site da importação);
 *   - `nome` → firstName;
 *   - `CPF`  → vy_cpf (sem "." e "-", com zeros à esquerda);
 *   - `Data Admissao` → vy_admissao; `Inicio Afastamento` → vy_iniafastamento;
 *     `Fim Afastamento` → vy_fimafastamento.
 * Colunas não mapeadas passam direto. Retorna o novo arquivo (CSV), quantas
 * linhas não resolveram o site e o total.
 */
export async function mapEmployerImport(
  file: File,
  map: EmployerSiteMap,
): Promise<{ file: File; unresolved: number; total: number }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou ilegível.");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) throw new Error("A planilha não contém linhas de dados.");

  let unresolved = 0;
  const out = rows.map((row) => {
    const next: Record<string, unknown> = {};
    let codigo = "";
    let filial = "";
    for (const [key, value] of Object.entries(row)) {
      const nk = norm(key);
      if (SITE_CODE_SRC.has(nk)) {
        codigo = String(value ?? "").trim();
        continue; // consumida para resolver o site; não vai para o import
      }
      if (SITE_NAME_SRC.has(nk)) {
        filial = String(value ?? "").trim();
        continue;
      }
      if (CPF_SRC.has(nk)) {
        next["vy_cpf"] = cleanCpf(value);
        continue;
      }
      if (nk === "siteid") continue; // remove site pré-existente
      const target = COLUMN_MAP[nk];
      if (target) {
        next[target] = value;
        continue;
      }
      next[key] = value; // colunas não mapeadas passam direto
    }
    const siteId =
      (codigo && map.byCodigo.get(codigo.toLowerCase())) ||
      (filial && map.byNome.get(filial.toLowerCase())) ||
      "";
    if (!siteId) unresolved++;
    next.siteId = siteId;
    return next;
  });

  const outWs = XLSX.utils.json_to_sheet(out);
  const csv = XLSX.utils.sheet_to_csv(outWs);
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  return {
    file: new File([csv], `${baseName}.csv`, { type: "text/csv" }),
    unresolved,
    total: rows.length,
  };
}

// ---- Mapeamento configurável (tela de relacionamento coluna → campo) ----

/** Alvos especiais do mapeamento. */
export const IGNORE_TARGET = ""; // coluna ignorada
export const EMPLOYER_CODE_TARGET = "__employer_code__"; // resolve site pelo código
export const EMPLOYER_NAME_TARGET = "__employer_name__"; // resolve site pelo nome
/** Prefixos dos alvos: campo nativo do ClearID (coluna do import) e customizável. */
export const NATIVE_TARGET_PREFIX = "native:";
export const CF_TARGET_PREFIX = "cf:";

/** Normaliza um header (exposto para a UI casar sugestões). */
export const normalizeHeader = (s: string) => norm(s);

/** Lê os cabeçalhos (primeira linha) da planilha, para montar a tela de mapeamento. */
export async function readHeaders(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou ilegível.");
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const first = (matrix[0] ?? []) as unknown[];
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const h of first) {
    const name = String(h ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    headers.push(name);
  }
  return headers;
}

/**
 * Aplica um mapeamento coluna→alvo escolhido pelo usuário na tela. `mapping` é
 * `{ <cabeçalho da planilha>: <alvo> }`, onde o alvo é um dos especiais acima,
 * `native:<coluna>` (campo nativo do import) ou `cf:<nome>` (campo customizável).
 * Colunas sem alvo (ou alvo vazio) são ignoradas. Campos cujo nome contém "cpf"
 * são limpos (sem pontuação, com zeros à esquerda).
 */
export async function applyColumnMapping(
  file: File,
  mapping: Record<string, string>,
  employerMap: EmployerSiteMap,
  opts?: { defaultWorkerTypeCode?: string; defaultWorkerTypeId?: string },
): Promise<{ file: File; unresolved: number; total: number }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia ou ilegível.");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) throw new Error("A planilha não contém linhas de dados.");

  const usesEmployer = Object.values(mapping).some(
    (t) => t === EMPLOYER_CODE_TARGET || t === EMPLOYER_NAME_TARGET,
  );
  const defaultWtCode = (opts?.defaultWorkerTypeCode ?? "").trim();
  const defaultWtId = (opts?.defaultWorkerTypeId ?? "").trim();

  let unresolved = 0;
  const out = rows.map((row) => {
    const next: Record<string, unknown> = {};
    let codigo = "";
    let nome = "";
    for (const [key, value] of Object.entries(row)) {
      const target = mapping[key];
      if (!target) continue; // ignorada
      if (target === EMPLOYER_CODE_TARGET) {
        codigo = String(value ?? "").trim();
        continue;
      }
      if (target === EMPLOYER_NAME_TARGET) {
        nome = String(value ?? "").trim();
        continue;
      }
      if (target.startsWith(NATIVE_TARGET_PREFIX)) {
        next[target.slice(NATIVE_TARGET_PREFIX.length)] = value;
        continue;
      }
      if (target.startsWith(CF_TARGET_PREFIX)) {
        const name = target.slice(CF_TARGET_PREFIX.length);
        next[name] = /cpf/i.test(name) ? cleanCpf(value) : value;
        continue;
      }
    }
    if (usesEmployer) {
      const siteId =
        (codigo && employerMap.byCodigo.get(codigo.toLowerCase())) ||
        (nome && employerMap.byNome.get(nome.toLowerCase())) ||
        "";
      if (!siteId) unresolved++;
      next.siteId = siteId;
    }
    // Tipo de trabalhador padrão: só quando a planilha não trouxe um valor.
    // Injeta o CÓDIGO (para o ClearID) e o ID exato (para o shadow no Supabase,
    // pois o código Argus é ambíguo entre Visitante/Terceiro).
    if (defaultWtCode && !String(next.workerTypeCode ?? "").trim()) {
      next.workerTypeCode = defaultWtCode;
      if (defaultWtId) next.supabaseWorkerTypeId = defaultWtId;
    }
    return next;
  });

  const outWs = XLSX.utils.json_to_sheet(out);
  const csv = XLSX.utils.sheet_to_csv(outWs);
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  return {
    file: new File([csv], `${baseName}.csv`, { type: "text/csv" }),
    unresolved,
    total: rows.length,
  };
}
