// Guarda de gravação da identidade: ao salvar, avalia as datas de afastamento/
// férias e as datas de validade (certidões, cursos, ASO…) preenchidas, incluindo
// as validades da empresa vinculada (empresa vencida bloqueia o colaborador),
// conforme as regras do site (site_date_rules: site sem bloqueio não bloqueia por
// validade). Se houver afastamento em vigor ou alguma validade vencida, a pessoa é inativada
// no ClearID e o motivo é gravado no campo "Motivo do Afastamento" do cliente
// (identity_custom_fields). Quando a situação é regularizada numa gravação
// posterior, a pessoa inativada por ESTA regra é reativada e o motivo limpo.
//
// Os motivos automáticos de afastamento/férias são os mesmos da rotina diária
// de reativação da API (LeaveReactivationService), que reativa a pessoa quando
// o término passa. O motivo de validade vencida é tratado aqui, na gravação.
import { argusApi } from "@/lib/argus-client";

/** Motivos automáticos reconhecidos pela rotina diária de reativação da API. */
export const LEAVE_REASON = "Afastamento Automático";
export const VACATION_REASON = "Férias";
/** Prefixo do motivo gravado quando há validade vencida. */
export const EXPIRED_REASON_PREFIX = "Vencido:";

export type GuardDate = {
  /** Nome técnico do campo (ex.: vy_aso). */
  name: string;
  /** Rótulo exibido ao usuário. */
  label: string;
  /** Valor ISO yyyy-MM-dd (vazio = sem data). */
  value: string;
  /** Campo de data com cálculo de vencimento ligado (Campos personalizados). */
  tracksExpiration: boolean;
};

export type GuardEvaluation = {
  /** Validades vencidas (data < hoje). */
  expired: { name: string; label: string; value: string }[];
  /** Afastamento ou férias em vigor hoje. */
  leave: { kind: "afastamento" | "ferias"; start: string; end: string | null } | null;
  /** Motivo a gravar quando a pessoa deve ficar inativa; null = nada a bloquear. */
  reason: string | null;
};

/** Resultado da avaliação + onde gravar o motivo, entregue pelo formulário à página. */
export type SaveGuard = GuardEvaluation & {
  /** Nome técnico do campo de motivo do afastamento (quando existe no cliente). */
  motivoFieldName: string | null;
  /** Valor atual do motivo antes desta gravação. */
  currentMotivo: string;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const has = (name: string, part: string) => norm(name).includes(part);

/** Campo de motivo do afastamento: nome contém "motivo" e "afastamento" (mesma regra da API). */
export const isMotivoField = (name: string) => has(name, "motivo") && has(name, "afastamento");

const isStartField = (n: string) => has(n, "ini") || has(n, "inicio") || has(n, "start");
const isEndField = (n: string) =>
  has(n, "fim") || has(n, "termino") || has(n, "final") || has(n, "end");
const isLeaveField = (n: string) =>
  (has(n, "afastamento") || has(n, "ferias")) && !has(n, "motivo") && !has(n, "obs");

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** yyyy-MM-dd → dd/MM/yyyy (para o texto do motivo). */
export const isoToBr = (v: string) => (isIso(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);

/**
 * Avalia as datas do formulário. Comparação por string ISO (yyyy-MM-dd), sem fuso.
 * - Validade vencida: campo com vencimento ligado e data < hoje.
 * - Afastamento/férias em vigor: início ≤ hoje e (sem término ou término ≥ hoje).
 */
export function evaluateSaveGuard(dates: GuardDate[], today = todayIso()): GuardEvaluation {
  const filled = dates.filter((d) => isIso(d.value));
  const leaveDates = filled.filter((d) => isLeaveField(d.name));
  const expired = filled
    .filter((d) => d.tracksExpiration && !isLeaveField(d.name) && d.value < today)
    .map(({ name, label, value }) => ({ name, label, value }));

  let leave: GuardEvaluation["leave"] = null;
  for (const kind of ["afastamento", "ferias"] as const) {
    const start = leaveDates.find((d) => has(d.name, kind) && !isEndField(d.name) && isStartField(d.name));
    if (!start || start.value > today) continue;
    const end = leaveDates.find((d) => has(d.name, kind) && isEndField(d.name));
    if (end && end.value < today) continue; // já terminou
    leave = { kind, start: start.value, end: end?.value ?? null };
    break;
  }

  let reason: string | null = null;
  if (leave) reason = leave.kind === "ferias" ? VACATION_REASON : LEAVE_REASON;
  else if (expired.length) {
    reason = `${EXPIRED_REASON_PREFIX} ${expired.map((e) => `${e.label} (${isoToBr(e.value)})`).join("; ")}`;
  }
  return { expired, leave, reason };
}

/** Motivo gravado por esta guarda (validade vencida) — pode ser limpo/reativado por ela. */
export const isGuardReason = (motivo: string) => motivo.trim().startsWith(EXPIRED_REASON_PREFIX);

export type GuardAction = "deactivated" | "activated" | null;

/**
 * Aplica a guarda após a gravação da identidade (ClearID + Supabase já salvos):
 * - há motivo → inativa a pessoa no ClearID (se ainda ativa);
 * - sem motivo, pessoa inativa e motivo anterior gravado por esta guarda →
 *   reativa (a validade foi regularizada).
 * O motivo em si já vai no payload do formulário (campo do site), gravado pela página.
 */
export async function applySaveGuard(
  identityId: string,
  guard: SaveGuard,
  currentStatus: string | null | undefined,
): Promise<GuardAction> {
  const active = String(currentStatus ?? "").toLowerCase() === "active";
  if (guard.reason) {
    if (active) await argusApi.deactivateIdentity(identityId);
    return "deactivated";
  }
  if (!active && isGuardReason(guard.currentMotivo)) {
    await argusApi.activateIdentity(identityId);
    return "activated";
  }
  return null;
}
