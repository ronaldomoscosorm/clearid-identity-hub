// Saga de compensação para gravar uma identity de forma atômica entre o
// Genetec ClearID (SaaS) e o Supabase (worker_type + company + espelho).
//
// ClearID e Supabase são sistemas heterogêneos — não há transação distribuída.
// Este módulo aproxima o comportamento com a política:
//
//   1. Grava no ClearID (create/update).
//   2. Grava no Supabase (mirror + company + workerType).
//   3. Se (2) falhar, DESFAZ (1) — cria compensação no ClearID.
//   4. Qualquer erro é propagado ao caller (throw), que mostra toast e não
//      declara sucesso.
//
// Limites conhecidos:
// - O ClearID não permite DELETE de identity (política do backend). Na
//   compensação de CREATE usamos `deactivateIdentity` (status=Inactive).
//   Não é rollback perfeito: a identity fica no PIAM marcada inativa e o
//   admin precisa apagar/reciclar depois.
// - Na compensação de UPDATE usamos o eTag NOVO devolvido pela primeira
//   chamada — o restore vale enquanto ninguém mais alterou entre as duas
//   requests. Se o segundo update falhar, o erro reporta "inconsistente".
import {
  argusApi,
  clearIdToFormValues,
  type ClearIdIdentity,
  type IdentityUpsert,
} from "@/lib/argus-client";
import {
  mirrorIdentities,
  saveIdentityCompany,
  saveIdentityWorkerType,
} from "@/lib/supabase-mirror";

export interface AtomicExtras {
  companyId: string | null;
  workerTypeId: string | null;
}

async function persistSupabaseSide(
  identityId: string,
  updated: ClearIdIdentity,
  extras: AtomicExtras,
): Promise<void> {
  await mirrorIdentities([updated]);
  await saveIdentityCompany(identityId, extras.companyId);
  await saveIdentityWorkerType(identityId, extras.workerTypeId);
}

/**
 * CREATE atômico. Sequência:
 *   1) createIdentity no ClearID.
 *   2) mirror + company + workerType no Supabase.
 *   3) Se (2) falhar, marca a identity criada como Inactive no ClearID.
 *
 * Retorna a identity do ClearID em caso de sucesso; lança em qualquer falha
 * (o caller precisa capturar e exibir).
 */
export async function createIdentityAtomic(
  payload: IdentityUpsert,
  extras: AtomicExtras,
): Promise<ClearIdIdentity> {
  const created = await argusApi.createIdentity(payload);
  try {
    await persistSupabaseSide(created.identityId, created, extras);
    return created;
  } catch (err) {
    // Compensação: desativa a identity no ClearID (delete não é permitido).
    const compensationErr = await tryCompensateCreate(created.identityId);
    const msg = (err as Error).message;
    if (compensationErr) {
      throw new Error(
        `Falha ao gravar no Supabase (${msg}). ATENÇÃO: a compensação no ClearID ` +
          `também falhou (${compensationErr}). Estado inconsistente — verifique a ` +
          `identity ${created.identityId} manualmente.`,
      );
    }
    throw new Error(
      `Falha ao gravar no Supabase (${msg}). A identity foi marcada como Inativa no ` +
        `ClearID (${created.identityId}); nenhuma alteração ficou persistida em ambos ` +
        `os sistemas.`,
    );
  }
}

/**
 * UPDATE atômico. Requer `originalIdentity` (snapshot do ClearID ANTES do
 * update) para poder restaurar em caso de falha do Supabase. Sequência:
 *   1) updateIdentity no ClearID (com o novo payload).
 *   2) mirror + company + workerType no Supabase.
 *   3) Se (2) falhar, faz updateIdentity de volta com o payload original,
 *      usando o eTag NOVO devolvido em (1).
 */
export async function updateIdentityAtomic(
  identityId: string,
  payload: IdentityUpsert,
  extras: AtomicExtras,
  originalIdentity: ClearIdIdentity,
): Promise<ClearIdIdentity> {
  const updated = await argusApi.updateIdentity(identityId, payload);
  try {
    await persistSupabaseSide(identityId, updated, extras);
    return updated;
  } catch (err) {
    const compensationErr = await tryCompensateUpdate(
      identityId,
      originalIdentity,
      updated.eTag ?? null,
    );
    const msg = (err as Error).message;
    if (compensationErr) {
      throw new Error(
        `Falha ao gravar no Supabase (${msg}). ATENÇÃO: a reversão no ClearID também ` +
          `falhou (${compensationErr}). Estado inconsistente — verifique a identity ` +
          `${identityId} manualmente.`,
      );
    }
    throw new Error(
      `Falha ao gravar no Supabase (${msg}). As alterações no ClearID foram revertidas ` +
        `para o estado anterior; nenhum campo ficou salvo.`,
    );
  }
}

/** Retorna a mensagem de erro se a compensação falhou, ou null em sucesso. */
async function tryCompensateCreate(identityId: string): Promise<string | null> {
  try {
    await argusApi.deactivateIdentity(identityId);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Retorna a mensagem de erro se a reversão do update falhou, ou null em sucesso. */
async function tryCompensateUpdate(
  identityId: string,
  originalIdentity: ClearIdIdentity,
  newETag: string | null,
): Promise<string | null> {
  try {
    const rollbackPayload = clearIdToFormValues(originalIdentity);
    await argusApi.updateIdentity(identityId, {
      ...rollbackPayload,
      eTag: newETag ?? originalIdentity.eTag ?? null,
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
