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

// Nomes de coluna aceitos na planilha para o código/nome do site da Employer.
const EMPLOYER_CODE_COLS = [
  "employersitecode",
  "codigosite",
  "sitecode",
  "codigoemployer",
  "codigo",
  "cod",
];
const EMPLOYER_NAME_COLS = ["employersitename", "nomesite", "sitename", "nomeemployer", "nome"];

/**
 * Resolve, por linha, o site da Employer (código ou nome, vindos da planilha)
 * para o `siteId` do ClearID via o mapeamento (employer_sites). Substitui a
 * coluna `siteId`. Retorna o novo arquivo e quantas linhas não resolveram.
 */
export async function withResolvedSiteId(
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

  const pick = (row: Record<string, unknown>, cols: string[]): string => {
    for (const [key, value] of Object.entries(row)) {
      if (cols.includes(key.trim().toLowerCase())) return String(value ?? "").trim();
    }
    return "";
  };

  let unresolved = 0;
  const normalized = rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.trim().toLowerCase() === "siteid") continue;
      next[key] = value;
    }
    const codigo = pick(row, EMPLOYER_CODE_COLS);
    const nome = pick(row, EMPLOYER_NAME_COLS);
    const siteId =
      (codigo && map.byCodigo.get(codigo.toLowerCase())) ||
      (nome && map.byNome.get(nome.toLowerCase())) ||
      "";
    if (!siteId) unresolved++;
    next.siteId = siteId;
    return next;
  });

  const outWs = XLSX.utils.json_to_sheet(normalized);
  const csv = XLSX.utils.sheet_to_csv(outWs);
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  return {
    file: new File([csv], `${baseName}.csv`, { type: "text/csv" }),
    unresolved,
    total: rows.length,
  };
}
