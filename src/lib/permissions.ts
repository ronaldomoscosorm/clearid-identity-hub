import { useMenuTree, type AccessProfileOperation } from "./menu-tree";
import { useCurrentUser } from "./current-user";

/**
 * Verifica se o usuário atual pode executar uma operação (select/insert/update/delete)
 * em uma tela identificada pelo `menuKey` (ex.: `identities`, `visitas`, `regras`).
 *
 * Fonte: operations do AccessProfile no Portal Argus (mapeadas em useMenuTree).
 * Em dev (accessProfileId="0" = bypass), todas as operações são permitidas.
 *
 * Uso em componentes:
 *
 *   const { canSelect, canInsert, canUpdate, canDelete } = usePermissions("identities");
 *   {canInsert && <Button>Nova pessoa</Button>}
 */
export type CrudOperation = keyof Pick<AccessProfileOperation, "select" | "insert" | "update" | "delete">;

export function usePermissions(menuKey: string) {
  const { data: user } = useCurrentUser();
  const { data } = useMenuTree();

  const bypass = user?.accessProfileId === "0" || user?.accessProfileId === null;
  const op = data?.operations.get(menuKey);

  return {
    canSelect: bypass || op?.select === true,
    canInsert: bypass || op?.insert === true,
    canUpdate: bypass || op?.update === true,
    canDelete: bypass || op?.delete === true,
    /** Genérico: `can("insert")` */
    can(operation: CrudOperation): boolean {
      if (bypass) return true;
      return op?.[operation] === true;
    },
  };
}
