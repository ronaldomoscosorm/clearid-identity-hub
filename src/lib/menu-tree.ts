import { useQuery } from "@tanstack/react-query";
import { getConfig } from "./argus-env";
import { useCurrentUser } from "./current-user";

/**
 * Árvore de menus do Argus, combinada com as operações do AccessProfile do usuário.
 * Fluxo:
 *   1. GET /api/menus              (backend .NET, hardcoded)          → árvore completa
 *   2. GET /api/worker-types       (backend .NET)                     → dynamicChildren de identities
 *   3. GET portal/access-profiles/{id}/menus (Portal Argus)           → CRUD por menuKey
 *   4. Filtra a árvore: mantém itens com operations.select === true
 *   5. Expõe helpers de permissão via usePermissions
 */

// ---------- Tipos vindos do backend ----------
export interface MenuNode {
  key: string;
  label: string;
  icon: string | null;
  route: string | null;
  order: number;
  children: MenuNode[];
  dynamicChildren: string | null;
}

export interface WorkerType {
  code: string;
  label: string;
  icon: string | null;
  route: string;
  order: number;
}

// ---------- Tipos vindos do Portal Argus ----------
export interface AccessProfileOperation {
  menuKey: string;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}

// ---------- Config ----------
const PORTAL_BASE =
  (import.meta.env.VITE_PORTAL_ARGUS_API_URL as string | undefined) ??
  "https://portal.rmtecho.com.br/api";

// ---------- Fetches ----------
async function fetchMenus(): Promise<MenuNode[]> {
  // Mock DEV: VITE_DEV_MOCK_MENUS (JSON de MenuNode[]) permite testar a restrição
  // de menus por usuário sem o backend. Só ativa com `vite dev`.
  if (import.meta.env.DEV) {
    const raw = import.meta.env.VITE_DEV_MOCK_MENUS as string | undefined;
    if (raw && raw.trim()) {
      try {
        return JSON.parse(raw) as MenuNode[];
      } catch {
        console.warn("[menu] VITE_DEV_MOCK_MENUS inválido (JSON) — ignorando.");
      }
    }
  }
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/api/menus`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET /api/menus falhou (${res.status})`);
  const env = (await res.json()) as ApiEnvelope<MenuNode[]>;
  return env.data ?? [];
}

async function fetchWorkerTypes(): Promise<WorkerType[]> {
  // Resiliente: uma falha aqui não deve quebrar a árvore de menus (os worker
  // types dinâmicos são complemento). Retorna [] em erro/CORS.
  try {
    const cfg = getConfig();
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/api/worker-types`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const env = (await res.json()) as ApiEnvelope<WorkerType[]>;
    return env.data ?? [];
  } catch {
    return [];
  }
}

async function fetchOperations(profileId: string): Promise<AccessProfileOperation[]> {
  // Bypass no dev: profileId "0" = sem restrição.
  if (profileId === "0") return [];

  // Mock DEV: VITE_DEV_MOCK_OPERATIONS (JSON de AccessProfileOperation[]) permite testar a
  // filtragem de menus por perfil sem o backend. Use com um VITE_DEV_MOCK_USER cujo
  // accessProfileId seja != "0" (ex.: "5"). Só ativa com `vite dev`.
  if (import.meta.env.DEV) {
    const raw = import.meta.env.VITE_DEV_MOCK_OPERATIONS as string | undefined;
    if (raw && raw.trim()) {
      try {
        return JSON.parse(raw) as AccessProfileOperation[];
      } catch {
        console.warn("[menu] VITE_DEV_MOCK_OPERATIONS inválido (JSON) — ignorando.");
      }
    }
  }

  // Permissões de menu do perfil (visibilidade + CRUD), por menuKey.
  // Endpoint liberado a qualquer usuário autenticado (o admin edita via PUT).
  const res = await fetch(
    `${PORTAL_BASE.replace(/\/+$/, "")}/access-profiles/${encodeURIComponent(profileId)}/menus`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`GET access-profiles/${profileId}/menus falhou (${res.status})`);
  return (await res.json()) as AccessProfileOperation[];
}

// ---------- Filtragem ----------
function filterTreeByOperations(
  tree: MenuNode[],
  opsByKey: Map<string, AccessProfileOperation>,
  bypass: boolean,
): MenuNode[] {
  const walk = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .map((node) => {
        const children = walk(node.children);
        const op = opsByKey.get(node.key);
        const isSelectable = bypass || op?.select === true;
        const hasVisibleChildren = children.length > 0;

        // Grupo sem filhos e sem select → esconde
        if (!isSelectable && !hasVisibleChildren) return null;

        return { ...node, children } as MenuNode;
      })
      .filter((n): n is MenuNode => n !== null)
      .sort((a, b) => a.order - b.order);

  return walk(tree);
}

function injectDynamicChildren(tree: MenuNode[], workerTypes: WorkerType[]): MenuNode[] {
  return tree.map((node) => {
    let children = node.children.map((c) => ({ ...c }));

    if (node.dynamicChildren === "workerTypes") {
      const dyn: MenuNode[] = workerTypes.map((wt) => ({
        key: `${node.key}.${wt.code}`,
        label: wt.label,
        icon: wt.icon ?? null,
        route: wt.route,
        order: wt.order,
        children: [],
        dynamicChildren: null,
      }));
      children = [...children, ...dyn].sort((a, b) => a.order - b.order);
    }

    return {
      ...node,
      children: injectDynamicChildren(children, workerTypes),
    };
  });
}

// ---------- Hook público ----------
export function useMenuTree() {
  const { data: user } = useCurrentUser();
  const profileId = user?.accessProfileId ?? null;
  // Bypass APENAS no dev/sem-auth (accessProfileId === "0"). Um usuário real SEM
  // AccessProfile (profileId null) NÃO faz bypass: sem operações, a árvore fica
  // vazia (fail-closed) e o AppShell exibe o aviso "perfil sem menus".
  const bypass = profileId === "0";

  return useQuery({
    queryKey: ["menu-tree", profileId ?? "anonymous"],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [menus, workerTypes, operations] = await Promise.all([
        fetchMenus(),
        fetchWorkerTypes(),
        profileId ? fetchOperations(profileId) : Promise.resolve([]),
      ]);

      const opsByKey = new Map(operations.map((o) => [o.menuKey, o]));
      const withDynamic = injectDynamicChildren(menus, workerTypes);
      const filtered = filterTreeByOperations(withDynamic, opsByKey, bypass);

      return { tree: filtered, operations: opsByKey };
    },
  });
}
