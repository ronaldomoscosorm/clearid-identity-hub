// Registro de atividades do usuário (auditoria) para as gravações que o front faz
// DIRETO no Supabase (empresas, campos, layouts, tipos…) e para login/logout.
// As chamadas ao ArgusClearId.Api já são auditadas pelo middleware do backend.
// Best-effort: nunca lança nem bloqueia a ação do usuário.
import { argusApi, type AuditAction, type AuditEvent } from "@/lib/argus-client";

export function audit(event: AuditEvent): void {
  try {
    void argusApi.logAudit(event).catch((e) => {
      console.warn("[audit] não registrado:", (e as Error).message);
    });
  } catch (e) {
    console.warn("[audit] não registrado:", (e as Error).message);
  }
}

/** Atalho: created/updated conforme exista `editing`. */
export function auditSave(
  editing: unknown,
  entityType: string,
  entityId: string | null | undefined,
  label: string | null | undefined,
  what: string,
  details?: Record<string, unknown>,
): void {
  const action: AuditAction = editing ? "updated" : "created";
  audit({
    action,
    entityType,
    entityId: entityId ?? null,
    entityLabel: label ?? null,
    summary: `${editing ? "Alterou" : "Criou"} ${what}${label ? ` ${label}` : ""}`,
    details,
  });
}

export function auditDelete(
  entityType: string,
  entityId: string | null | undefined,
  label: string | null | undefined,
  what: string,
  details?: Record<string, unknown>,
): void {
  audit({
    action: "deleted",
    entityType,
    entityId: entityId ?? null,
    entityLabel: label ?? null,
    summary: `Excluiu ${what}${label ? ` ${label}` : ""}`,
    details,
  });
}
