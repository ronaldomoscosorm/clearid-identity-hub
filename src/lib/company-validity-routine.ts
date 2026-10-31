import { toast } from "sonner";
import { argusApi, type LeaveReactivationResult } from "@/lib/argus-client";
import type { TFn } from "@/lib/i18n";

const POLL_MS = 5000;
const MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * Após alterar datas de validade de uma empresa, dispara a rotina de datas só para os
 * colaboradores dela (job em segundo plano na API) e acompanha até concluir:
 * empresa regularizada → quem estava "Vencido:" por ela volta a Ativo; empresa vencida →
 * todos são bloqueados (conforme as regras do site). Não lança: o resultado vai em toasts.
 */
export async function runCompanyValidityRoutine(opts: {
  companyId: string;
  companyName: string;
  profile: string;
  t: TFn;
}): Promise<LeaveReactivationResult | null> {
  const { companyId, companyName, profile, t } = opts;
  const toastId = `company-routine-${companyId}`;
  try {
    const start = await argusApi.startLeaveReactivationJob({ companyId, environment: profile });
    toast.loading(t("companies.toast.routineStarted", { name: companyName }), { id: toastId });
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const job = await argusApi.getLeaveReactivationJob(start.jobId, profile);
      if (job.status === "Completed" && job.result) {
        const r = job.result;
        const summary = t("companies.toast.routineDone", {
          name: companyName,
          reactivated: r.reactivated + r.cleared,
          deactivated: r.deactivated + r.reasonUpdated,
          checked: r.checked,
        });
        if (r.failed > 0)
          toast.warning(`${summary} ${t("companies.toast.routineFailures", { count: r.failed })}`, {
            id: toastId,
          });
        else toast.success(summary, { id: toastId });
        return r;
      }
      if (job.status === "Failed") {
        toast.error(
          t("companies.toast.routineFailed", { name: companyName, error: job.error ?? "" }),
          { id: toastId },
        );
        return null;
      }
    }
    toast.warning(t("companies.toast.routineTimeout", { name: companyName }), { id: toastId });
    return null;
  } catch (e) {
    toast.error(
      t("companies.toast.routineFailed", { name: companyName, error: (e as Error).message }),
      { id: toastId },
    );
    return null;
  }
}
