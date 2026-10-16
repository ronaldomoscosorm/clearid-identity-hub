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
export async function withSiteId(file: File, siteId: string, sheet?: string): Promise<File> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = pickSheetName(XLSX, wb, sheet);
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

/**
 * Resolve o site da Employer de forma tolerante: a planilha pode trazer o
 * CÓDIGO na coluna "Filial" (ex.: "0032") ou o nome na coluna "Código". Tenta
 * código→código, nome→nome e depois cruzado; compara também sem zeros à
 * esquerda (o Excel costuma perder o "00" de "0032").
 */
function resolveEmployerSite(map: EmployerSiteMap, codigo: string, nome: string): string {
  const stripZeros = (v: string) => v.replace(/^0+(?=\d)/, "");
  const lookup = (m: Map<string, string>, raw: string): string => {
    const v = raw.trim().toLowerCase();
    if (!v) return "";
    const direct = m.get(v);
    if (direct) return direct;
    const sv = stripZeros(v);
    for (const [k, id] of m) if (stripZeros(k) === sv) return id;
    return "";
  };
  return (
    lookup(map.byCodigo, codigo) ||
    lookup(map.byNome, nome) ||
    lookup(map.byCodigo, nome) ||
    lookup(map.byNome, codigo)
  );
}

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
  [norm("Data de Admissao")]: "vy_admissao",
  [norm("Admissao")]: "vy_admissao",
  [norm("Inicio Afastamento")]: "vy_iniafastamento",
  [norm("Inicio de Afastamento")]: "vy_iniafastamento",
  [norm("Fim Afastamento")]: "vy_fimafastamento",
  [norm("Fim de Afastamento")]: "vy_fimafastamento",
  [norm("Final Afastamento")]: "vy_fimafastamento",
  [norm("Final de Afastamento")]: "vy_fimafastamento",
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
 * Chave de upsert do import: o backend exige externalId ou email. Planilhas de
 * RH (Employer/Genetec) só trazem CPF — então, sem externalId e sem email na
 * linha, o CPF limpo vira o externalId (convenção do ClearID para essas pessoas).
 */
function ensureKeyFromCpf(next: Record<string, unknown>, cpf: string): void {
  const has = (k: string) => String(next[k] ?? "").trim().length > 0;
  if (!cpf || has("externalId") || has("email")) return;
  next.externalId = cpf;
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
    let cpf = "";
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
        cpf = String(next["vy_cpf"] ?? "");
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
    const siteId = resolveEmployerSite(map, codigo, filial);
    if (!siteId) unresolved++;
    next.siteId = siteId;
    ensureKeyFromCpf(next, cpf);
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
/** Resolve o site pelo NOME no catálogo do ClearID (ex.: "LA-BR-Itumbiara (ITU1)"). */
export const CLEARID_SITE_NAME_TARGET = "__clearid_site_name__";
/** Alvo "Cliente · Nome": a linha vai para o cliente (perfil ClearID) indicado na planilha. */
export const CLIENT_NAME_TARGET = "__client_name__";
/** Alvo "Regra · Nome": após importar, a pessoa é incluída na regra (team) indicada na planilha. */
export const TEAM_NAME_TARGET = "__team_name__";

/** Nome normalizado para comparar cliente/site: minúsculo, sem acento, só letras e números. */
export function normKey(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type XlsxWorkbook = { SheetNames: string[]; Sheets: Record<string, unknown> };

/**
 * Escolhe a aba a importar: a preferida (quando existe) ou a primeira que parece
 * uma tabela (linha 1 com 2+ cabeçalhos). Pula abas de capa/resumo.
 */
export function pickSheetName(XLSX: typeof import("xlsx"), wb: XlsxWorkbook, preferred?: string): string {
  if (preferred && wb.SheetNames.includes(preferred)) return preferred;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name] as import("xlsx").WorkSheet;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", range: 0 });
    const first = (matrix[0] ?? []) as unknown[];
    const headers = first.filter((h) => String(h ?? "").trim()).length;
    if (headers >= 2) return name;
  }
  return wb.SheetNames[0];
}

/** Abas do arquivo e a sugerida (a primeira que parece tabela). */
export async function listSheets(file: File): Promise<{ names: string[]; suggested: string }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  if (!wb.SheetNames.length) throw new Error("Planilha vazia ou ilegível.");
  return { names: wb.SheetNames, suggested: pickSheetName(XLSX, wb) };
}

/** Valores distintos (não vazios) de uma coluna da planilha. */
export async function readDistinctValues(file: File, header: string, sheet?: string): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[pickSheetName(XLSX, wb, sheet)];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out = new Set<string>();
  for (const r of rows) {
    const v = String(r[header] ?? "").trim();
    if (v) out.add(v);
  }
  return [...out];
}
/** Alvo: tipo de trabalhador POR LINHA (nome ou código do tipo cadastrado no cliente). */
export const WORKER_TYPE_TARGET = "__worker_type__";

/** Tipo de trabalhador do cliente, para resolver o valor da planilha. */
export type WorkerTypeRef = {
  id: string;
  name: string;
  code?: string | null;
  argus_worker_type_code?: string | null;
  name_i18n?: unknown;
};

/** Resolve o valor da planilha (nome, código ou nome traduzido) para um tipo do cliente. */
export function resolveWorkerType(value: string, types: WorkerTypeRef[]): WorkerTypeRef | undefined {
  const v = norm(value);
  if (!v) return undefined;
  for (const t of types) {
    // Só nome/código do tipo no Supabase: o código Argus é compartilhado por vários tipos.
    const names: string[] = [t.name, t.code ?? ""];
    const i18n = t.name_i18n && typeof t.name_i18n === "object" ? Object.values(t.name_i18n as Record<string, unknown>) : [];
    for (const x of i18n) if (typeof x === "string") names.push(x);
    // Igualdade normalizada; tolera singular/plural ("TERCEIRIZADO" x "Terceirizados").
    const sing = (x: string) => x.replace(/s$/, "");
    if (names.some((n) => norm(n) === v || sing(norm(n)) === sing(v))) return t;
  }
  return undefined;
}
/** Prefixos dos alvos: campo nativo do ClearID (coluna do import) e customizável. */
/** Arquivo preparado para UM cliente; origRows[i] = linha da planilha original da linha i+2 do CSV. */
export type PreparedGroup = {
  client: string | null;
  label: string;
  file: File;
  origRows: number[];
  /** teamNames[i] = regra (team) da linha i+2 do CSV, quando a planilha traz a coluna "Regra · Nome". */
  teamNames?: string[];
};

/** siteId pelo nome: igualdade (minúsculo) e, na falta, sem o código entre parênteses. */
export function resolveSiteByName(map: Map<string, string>, siteName: string): string {
  const raw = (siteName ?? "").trim().toLowerCase();
  if (!raw) return "";
  const direct = map.get(raw);
  if (direct) return direct;
  const wanted = normKey(raw.replace(/\(.*?\)/g, ""));
  for (const [name, id] of map) {
    if (normKey(name) === wanted || normKey(name.replace(/\(.*?\)/g, "")) === wanted) return id;
  }
  return "";
}

export const NATIVE_TARGET_PREFIX = "native:";
export const CF_TARGET_PREFIX = "cf:";

/** Normaliza um header (exposto para a UI casar sugestões). */
export const normalizeHeader = (s: string) => norm(s);

/** Lê os cabeçalhos (primeira linha) da planilha, para montar a tela de mapeamento. */
export async function readHeaders(file: File, sheet?: string): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = pickSheetName(XLSX, wb, sheet);
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
  opts?: {
    defaultWorkerTypeCode?: string;
    defaultWorkerTypeId?: string;
    /** Nome do site (normalizado: minúsculo/trim) → siteId do ClearID. */
    clearIdSiteMap?: Map<string, string>;
    /** Tipos de trabalhador do cliente (para o alvo "tipo de trabalhador" por linha). */
    workerTypes?: WorkerTypeRef[];
    /** Aba a importar (default: a primeira que parece tabela). */
    sheet?: string;
    /** Alvo "Cliente · Nome": clientes que o usuário pode usar (código/rótulo do perfil ClearID). */
    clients?: { code: string; label: string }[];
    /** Cliente ativo (recebe o tipo padrão e as linhas sem coluna de cliente). */
    activeClient?: string;
    /** Por cliente: nome do site (minúsculo/trim) → siteId. */
    siteMapByClient?: Map<string, Map<string, string>>;
    /** Por cliente: tipos de trabalhador (para resolver o tipo por linha). */
    workerTypesByClient?: Map<string, WorkerTypeRef[]>;
  },
): Promise<{
  file: File;
  unresolved: number;
  total: number;
  /** Um arquivo preparado por cliente (client = código do perfil; null = cliente ativo). */
  groups: PreparedGroup[];
  /** Linhas cujo cliente não foi reconhecido (não entram em nenhum grupo). */
  unresolvedClients: number;
  unknownClients: string[];
}> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = pickSheetName(XLSX, wb, opts?.sheet);
  if (!sheetName) throw new Error("Planilha vazia ou ilegível.");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) throw new Error("A planilha não contém linhas de dados.");
  const usesClient = Object.values(mapping).some((t) => t === CLIENT_NAME_TARGET);
  const clients = opts?.clients ?? [];
  const clientByKey = new Map<string, { code: string; label: string }>();
  for (const c of clients) {
    clientByKey.set(normKey(c.code), c);
    clientByKey.set(normKey(c.label), c);
  }
  const activeClient = opts?.activeClient ?? null;
  const groups = new Map<string | null, { label: string; rows: Record<string, unknown>[]; origRows: number[]; teamNames: string[] }>();
  const usesTeam = Object.values(mapping).some((t) => t === TEAM_NAME_TARGET);
  let unresolvedClients = 0;
  const unknownClients = new Set<string>();

  const usesEmployer = Object.values(mapping).some(
    (t) => t === EMPLOYER_CODE_TARGET || t === EMPLOYER_NAME_TARGET,
  );
  // Resolução pelo NOME do site no catálogo ClearID (template Genetic "Site").
  const usesClearIdSite = Object.values(mapping).some((t) => t === CLEARID_SITE_NAME_TARGET);
  const clearIdSiteMap = opts?.clearIdSiteMap ?? new Map<string, string>();
  const defaultWtCode = (opts?.defaultWorkerTypeCode ?? "").trim();
  const defaultWtId = (opts?.defaultWorkerTypeId ?? "").trim();
  const workerTypes = opts?.workerTypes ?? [];

  let unresolved = 0;
  for (const row of rows) {
    // Número da linha na planilha (sheet_to_json guarda o índice 0-based em __rowNum__).
    const origRow = Number((row as { __rowNum__?: number }).__rowNum__ ?? NaN) + 1;
    const next: Record<string, unknown> = {};
    let codigo = "";
    let nome = "";
    let siteName = "";
    let cpf = "";
    let clientName = "";
    let teamName = "";
    for (const [key, value] of Object.entries(row)) {
      if (key === "__rowNum__") continue;
      const target = mapping[key];
      if (!target) continue; // ignorada
      if (target === CLIENT_NAME_TARGET) {
        clientName = String(value ?? "").trim();
        continue;
      }
      if (target === TEAM_NAME_TARGET) {
        teamName = String(value ?? "").trim();
        continue; // não vai para o import: usada na inclusão na regra após importar
      }
      if (target === EMPLOYER_CODE_TARGET) {
        codigo = String(value ?? "").trim();
        continue;
      }
      if (target === EMPLOYER_NAME_TARGET) {
        nome = String(value ?? "").trim();
        continue;
      }
      if (target === CLEARID_SITE_NAME_TARGET) {
        siteName = String(value ?? "").trim();
        continue; // consumida para resolver o site; não vai para o import
      }
      if (target === WORKER_TYPE_TARGET) {
        // Tipo por linha: quando reconhecido, prevalece sobre o tipo padrão do mapeamento.
        // Com coluna de cliente, usa os tipos DAQUELE cliente.
        const rowClient = usesClient ? clientByKey.get(normKey(clientName)) : undefined;
        const wtList = (rowClient && opts?.workerTypesByClient?.get(rowClient.code)) ?? workerTypes;
        const wt = resolveWorkerType(String(value ?? ""), wtList);
        if (wt) {
          next.workerTypeCode = wt.name; // ClearID recebe a descrição do tipo
          next.supabaseWorkerTypeId = wt.id;
        }
        continue;
      }
      // Duas colunas no mesmo destino: valor vazio não apaga um já preenchido.
      const assign = (k: string, v: unknown) => {
        const blank = String(v ?? "").trim() === "";
        const has = String(next[k] ?? "").trim() !== "";
        if (!(blank && has)) next[k] = v;
      };
      if (target.startsWith(NATIVE_TARGET_PREFIX)) {
        const col = target.slice(NATIVE_TARGET_PREFIX.length);
        // CPF mapeado direto para o externalId: limpa igual ao campo de CPF.
        assign(col, col === "externalId" && /cpf/i.test(key) ? cleanCpf(value) : value);
        continue;
      }
      if (target.startsWith(CF_TARGET_PREFIX)) {
        const name = target.slice(CF_TARGET_PREFIX.length);
        const isCpf = /cpf/i.test(name);
        assign(name, isCpf ? cleanCpf(value) : value);
        if (isCpf && !cpf) cpf = String(next[name] ?? "");
        continue;
      }
    }
    if (usesEmployer) {
      const siteId = resolveEmployerSite(employerMap, codigo, nome);
      // Site não resolvido não apaga um siteId mapeado diretamente (native:siteId).
      if (siteId) next.siteId = siteId;
      else if (!String(next.siteId ?? "").trim()) unresolved++;
    }
    // Cliente da linha (alvo "Cliente · Nome"): define em qual perfil a linha é importada.
    let clientCode: string | null = null;
    let clientLabel = "";
    if (usesClient) {
      const c = clientByKey.get(normKey(clientName));
      if (!c) {
        unresolvedClients++;
        if (clientName) unknownClients.add(clientName);
        continue; // sem cliente reconhecido não há onde importar
      }
      clientCode = c.code;
      clientLabel = c.label;
    }
    if (usesClearIdSite) {
      // Nome do site → siteId pelo catálogo ClearID do cliente da linha (tolera o
      // código entre parênteses: "LA-BR-Alphaville" == "LA-BR-Alphaville (ALP-1)").
      const map = (clientCode ? opts?.siteMapByClient?.get(clientCode) : undefined) ?? clearIdSiteMap;
      const siteId = resolveSiteByName(map, siteName);
      if (siteId) next.siteId = siteId;
      else if (!String(next.siteId ?? "").trim()) unresolved++;
    }
    // Tipo de trabalhador padrão: só quando a planilha não trouxe um valor e a
    // linha é do cliente ativo (o tipo padrão é escolhido no cliente ativo).
    // Injeta o CÓDIGO (para o ClearID) e o ID exato (para o shadow no Supabase,
    // pois o código Argus é ambíguo entre Visitante/Terceiro).
    const defaultApplies = !usesClient || (activeClient != null && clientCode === activeClient);
    if (defaultApplies && defaultWtCode && !String(next.workerTypeCode ?? "").trim()) {
      next.workerTypeCode = defaultWtCode;
      if (defaultWtId) next.supabaseWorkerTypeId = defaultWtId;
      // Padrão só vale para pessoas novas: quem já tem tipo no Supabase mantém o dela (a API decide).
      next.supabaseWorkerTypeIsDefault = "1";
    }
    ensureKeyFromCpf(next, cpf);
    const g = groups.get(clientCode) ?? { label: clientLabel, rows: [], origRows: [], teamNames: [] };
    g.rows.push(next);
    g.origRows.push(Number.isFinite(origRow) ? origRow : g.rows.length + 1);
    g.teamNames.push(teamName);
    groups.set(clientCode, g);
  }

  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  const prepared: PreparedGroup[] = [...groups.entries()].map(([client, g]) => {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(g.rows));
    const suffix = client ? `-${client}` : "";
    return {
      client,
      label: g.label,
      file: new File([csv], `${baseName}${suffix}.csv`, { type: "text/csv" }),
      origRows: g.origRows,
      ...(usesTeam ? { teamNames: g.teamNames } : {}),
    };
  });
  if (!prepared.length) {
    prepared.push({ client: null, label: "", file: new File([""], `${baseName}.csv`, { type: "text/csv" }), origRows: [] });
  }
  return {
    file: prepared[0].file,
    groups: prepared,
    unresolvedClients,
    unknownClients: [...unknownClients],
    unresolved,
    total: rows.length,
  };
}
