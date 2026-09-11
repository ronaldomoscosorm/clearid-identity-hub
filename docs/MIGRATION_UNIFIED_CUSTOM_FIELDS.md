# Migração — Frontend consumindo o endpoint unificado de Custom Fields

**Alvo:** `clearid-identity-hub`
**Referência backend:** `ArgusClearId.Api` — `CustomFieldsController` reformulado.
**Status atual do frontend:** consome ClearID via `argusApi.listCustomFields()` **e** faz queries diretas ao Supabase para os campos com `storage='supabase'` e para as seções locais. Duplicidade que dá pra eliminar agora.
**Storage de campos/seções:** `clearid` | `supabase` | `both`.

## Objetivo

Substituir a leitura direta ao Supabase (via `@supabase/supabase-js`) pelo endpoint unificado `/api/custom-fields` (e `/api/custom-fields/sections`). O backend passa a ser a **única fachada**: retorna união ClearID + Supabase com o `storage` explícito em cada item.

## Ganhos

- **Contrato único** — quem consome não precisa saber que existe Supabase.
- **Segurança** — a `service_role_key` fica no backend (env var), sai do bundle público.
- **Menos código no frontend** — some `supaFieldsQuery`, some `listSupabaseSections`, some helpers de merge (`unifySections`, `unifyCustomFields` inline no `campos-personalizados.tsx`).
- **Rollback fácil** — os métodos antigos permanecem no `argus-client.ts`; a chave é migrar componente a componente.

## Contrato do backend (já publicado)

### `GET /api/custom-fields`

Query params:

| Param | Valores | Default | O que faz |
|---|---|---|---|
| `source` | `clearid` \| `supabase` \| `both` \| `all` | `clearid` | Filtro por origem |
| `profile` | ex.: `Vylor` | header `X-ClearId-Environment` | Cliente |
| `accountId` | GUID | — | Só relevante para lado ClearID |
| `includeDeleted` | `true`/`false` | `false` | Inclui apagados logicamente |

Response `data` = `UnifiedCustomFieldDef[]` (declarado em [src/lib/argus-client.ts](../src/lib/argus-client.ts) como o interface novo). Cada item traz:

```ts
{
  customFieldName: string;
  displayName?: string | null;
  customFieldType?: string | null;   // Text | Numeric | Boolean | DateTime | Decimal | Date
  storage: "clearid" | "supabase" | "both";
  profile?: string | null;
  sectionName?: string | null;
  isReadOnly: boolean;
  synchronizationEnabled: boolean;
  isDeleted: boolean;
  eTag?: string | null;
  attachmentEnabled: boolean;
  attachmentAccept?: string | null;   // "application/pdf,image/*"
  attachmentRequired: boolean;
}
```

### `POST /api/custom-fields` e `PUT /api/custom-fields/{name}`

Body: `UpsertCustomFieldRequest`. Payload unificado com `storage`. Roteia:
- `storage=clearid` → cria/atualiza no ClearID via `IIdentityCustomFieldService`.
- `storage=supabase` → cria/atualiza no Supabase via `ISupabaseCustomFieldRepository`.
- `storage=both` → cria/atualiza nos dois; se Supabase falhar após ClearID no `POST`, compensa com `DELETE` no ClearID (evita órfão).

### `DELETE /api/custom-fields/{name}`

Query: `?storage=clearid|supabase|both&profile=…`.

### `GET/POST/PUT/DELETE /api/custom-fields/sections`

Mesmos padrões (source, storage, profile). Response `data` = `UnifiedCustomFieldSection[]`:

```ts
{
  sectionName: string;
  displayName?: string | null;
  index: number;
  storage: "clearid" | "supabase" | "both";
  profile?: string | null;
  fieldNames: string[];    // preenchido só quando vem do ClearID
  eTag?: string | null;
}
```

## Helpers novos no frontend (já commitados)

Em [src/lib/argus-client.ts](../src/lib/argus-client.ts):

- **Tipos:** `UnifiedCustomFieldDef`, `UnifiedCustomFieldSection`
- **Métodos:**
  - `argusApi.listCustomFieldsUnified({ source, profile, includeDeleted })`
  - `argusApi.upsertCustomFieldUnified(payload, method, customFieldName?)`
  - `argusApi.deleteCustomFieldUnified(name, { storage, profile })`
  - `argusApi.listCustomFieldSectionsUnified({ source, profile })`
  - `argusApi.upsertCustomFieldSectionUnified(payload, method, sectionName?)`
  - `argusApi.deleteCustomFieldSectionUnified(name, { storage, profile })`

Os métodos antigos (`listCustomFields`, `createCustomField`, `updateCustomField`, `deleteCustomField`, `listCustomFieldSections`, `createCustomFieldSection`, `updateCustomFieldSection`, `deleteCustomFieldSection`) **continuam funcionando** — ainda batem no mesmo endpoint (o backend é retrocompatível). São bons para código legado que não precisa do storage.

## Passo a passo da migração

### Passo 1 — `campos-personalizados.tsx` (tela principal)

Arquivo: [src/routes/_authenticated/campos-personalizados.tsx](../src/routes/_authenticated/campos-personalizados.tsx)

#### 1.1. Substituir as duas queries por uma única

**Antes:**

```tsx
const query = useQuery({
  queryKey: ["custom-fields"],
  queryFn: () => argusApi.listCustomFields(),
  retry: false,
});

const supaFieldsQuery = useQuery({
  queryKey: ["supabase-custom-fields", activeProfile],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .select("custom_field_name, display_name, custom_field_type, is_read_only, synchronization_enabled, is_deleted, storage, section_name")
      .eq("profile", activeProfile)
      .in("storage", ["supabase", "both"])
      .eq("is_deleted", false);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
```

**Depois:**

```tsx
const query = useQuery({
  queryKey: ["custom-fields", "unified", activeProfile],
  queryFn: () =>
    argusApi.listCustomFieldsUnified({ source: "all", profile: activeProfile }),
  retry: false,
});
// supaFieldsQuery: REMOVER
```

#### 1.2. Simplificar `allItems`, `storageOfField`, `sectionOfField`

O `data` de `query` já é `UnifiedCustomFieldDef[]` — sem precisar deduplicar/merge:

```tsx
const allItems = useMemo(
  () => (query.data ?? []).filter((f) => !f.isDeleted),
  [query.data],
);

const storageOfField = useMemo(() => {
  const m = new Map<string, "clearid" | "supabase" | "both">();
  for (const f of query.data ?? []) m.set(f.customFieldName, f.storage);
  return m;
}, [query.data]);

// sectionOfField vira mais simples também: cada item já tem sectionName
const sectionOfField = useMemo(() => {
  const m = new Map<string, string>();
  for (const f of query.data ?? []) if (f.sectionName) m.set(f.customFieldName, f.sectionName);
  // Fallback (opcional): completar com as seções que só têm agrupamento no ClearID
  for (const sec of sectionsQuery.data ?? []) {
    for (const name of sec.fieldNames) if (!m.has(name)) m.set(name, sec.sectionName);
  }
  return m;
}, [query.data, sectionsQuery.data]);
```

#### 1.3. Substituir a `sectionsQuery` pela unificada

```tsx
const sectionsQuery = useQuery({
  queryKey: ["custom-field-sections", "unified", activeProfile],
  queryFn: () =>
    argusApi.listCustomFieldSectionsUnified({ source: "all", profile: activeProfile }),
  staleTime: 5 * 60 * 1000,
});
```

Remover as importações de `listSupabaseSections`, `unifySections`, `UnifiedSection` do helper local (não é mais necessário; o próprio `UnifiedCustomFieldSection` do `argus-client` cobre).

#### 1.4. Refactor da mutation `save` (create/update)

O backend cuida do roteamento. O frontend só envia o body:

```tsx
const save = useMutation({
  mutationFn: async () => {
    const attPatch = {
      attachmentEnabled: attEnabled,
      attachmentRequired: attEnabled ? attRequired : false,
      attachmentAccept: attEnabled ? attAccept : null,
    };

    if (mode === "edit") {
      await argusApi.upsertCustomFieldUnified(
        {
          displayName: displayName.trim(),
          storage,
          profile: activeProfile,
          sectionName: sectionName || null,
          isReadOnly,
          synchronizationEnabled: sync,
          eTag: field?.eTag ?? null,
          ...attPatch,
        },
        "PUT",
        field!.customFieldName,
      );
      return;
    }

    // CREATE
    await argusApi.upsertCustomFieldUnified({
      customFieldName: name.trim(),
      displayName: displayName.trim(),
      customFieldType: type,
      storage,
      profile: activeProfile,
      sectionName,
      isReadOnly,
      synchronizationEnabled: sync,
      ...attPatch,
    });
  },
  onSuccess: () => {
    toast.success(mode === "create" ? t("customFields.created") : t("customFields.updated"));
    onSaved();
  },
  onError: (e) => toast.error((e as ArgusApiError).message),
});
```

**Removidas as chamadas:** `argusApi.createCustomField`, `argusApi.updateCustomField`, `supabase.from("custom_field_definitions").upsert(...)`, e o wire da seção via `updateCustomFieldSection` no `create` (o backend já vincula por `sectionName` no payload).

#### 1.5. Refactor do delete

```tsx
const del = useMutation({
  mutationFn: async (f: UnifiedCustomFieldDef) => {
    await argusApi.deleteCustomFieldUnified(f.customFieldName, {
      storage: f.storage,
      profile: activeProfile,
    });
  },
  onSuccess: () => {
    toast.success(t("customFields.deleted"));
    setDeleting(null);
    reload();
    reloadSections();
  },
  onError: (e) => toast.error((e as ArgusApiError).message),
});
```

Remove o unlink manual da seção antes do delete (o backend do ClearID já toca no `updateCustomFieldSection` internamente — se não, dá pra reproduzir a lógica lá no `IIdentityCustomFieldService.DeleteAsync`).

### Passo 2 — `SectionDialog`

Antes:

```tsx
if (goesToClearId) await argusApi.createCustomFieldSection({...});
if (goesToSupabase) await upsertSupabaseSection({...});
```

Depois:

```tsx
await argusApi.upsertCustomFieldSectionUnified(
  {
    sectionName: name.trim(),
    displayName: displayName.trim(),
    index: safeIdx,
    storage,
    profile: activeProfile,
    eTag: section?.eTag,
  },
  mode === "edit" ? "PUT" : "POST",
  section?.sectionName,
);
```

E o delete:

```tsx
await argusApi.deleteCustomFieldSectionUnified(sec.sectionName, {
  storage: sec.storage,
  profile: activeProfile,
});
```

### Passo 3 — Remover helpers e imports obsoletos

Arquivo: [src/lib/custom-field-sections.ts](../src/lib/custom-field-sections.ts)

- `listSupabaseSections`, `upsertSupabaseSection`, `deleteSupabaseSection`, `unifySections`, `UnifiedSection` → **APAGAR** (movidos para backend).
- **Manter apenas** se algum outro componente ainda usa (fazer `grep` global antes).

Arquivo: [src/routes/_authenticated/campos-personalizados.tsx](../src/routes/_authenticated/campos-personalizados.tsx)

- Remover import de `@/integrations/supabase/client` — só se o arquivo não usa Supabase para outra coisa (checar `attachmentsQuery`, `delAttachment`, etc.). Se `is_local=true` para anexos continuar direto no Supabase, mantém o import.

### Passo 4 — Testes manuais

1. Trocar cliente na topbar para `Vylor` → tela lista os campos supabase-only + os do ClearID.
2. Editar um campo `both` → salva nos dois. Verifica no Supabase Studio + ClearID via `/api/custom-fields?source=clearid&profile=Vylor`.
3. Criar um campo `supabase` → aparece só no Supabase, não chega no ClearID.
4. Deletar um campo `both` → some dos dois.
5. Criar seção `both` → aparece nas duas listas.
6. Renomear rótulo de seção `both` → atualiza dos dois lados.

## Ordem de rollout sugerida

1. Deploy do **backend** com env vars `Supabase__Url` / `Supabase__ServiceRoleKey` no `web.config` → confirmar `GET /api/custom-fields?source=all&profile=Vylor` retorna a união correta.
2. Frontend: migrar **apenas a listagem** (`query` + `sectionsQuery`) para o unificado; manter os writes antigos. Deploy. Se algo quebrar, o write ainda funciona pelo caminho velho.
3. Migrar os **writes** (mutations `save` e `del`) para os métodos `Unified`. Deploy.
4. Remover os métodos antigos do `argus-client.ts` (`createCustomField`, etc.) e o helper `custom-field-sections.ts` inteiro. Deploy.
5. Remover a env `VITE_DISABLE_ACCESS_SCOPE` (bypass provisório) — quando o SSO estiver 100% em prod.

## Rollback

Cada passo é independente. Se o backend unificado falhar em prod:
- Restaurar env `VITE_DISABLE_ACCESS_SCOPE=true` + reverter frontend para os `list*/create*/update*/delete*` antigos → tudo volta a funcionar como estava (os métodos antigos continuam no bundle).
- Backend: se necessário, temporariamente colocar `AuthenticationSettings.Enabled=false` no ArgusClearid enquanto investiga.

## Referências

- Backend controller: [ArgusClearId.Api/Controllers/CustomFieldsController.cs](../../ArgusClearID/ArgusClearId.Api/Controllers/CustomFieldsController.cs)
- Repositórios: `Services/SupabaseCustomFieldRepository.cs`, `Services/SupabaseSectionRepository.cs`
- Config: `Configuration/SupabaseSettings.cs` + `appsettings.json` seção `Supabase`
- Frontend helpers novos: `src/lib/argus-client.ts` (busca por `Unified`)

## Checklist final

- [ ] Backend deployed com env vars Supabase configuradas
- [ ] `GET /api/custom-fields?source=all` retorna união correta (verificar via curl)
- [ ] `campos-personalizados.tsx` migrado — queries unificadas
- [ ] `SectionDialog` migrado — upsert/delete unificados
- [ ] `custom-field-sections.ts` removido (após confirmar zero referências)
- [ ] Testes manuais dos 6 cenários acima passaram
- [ ] Bypass `VITE_DISABLE_ACCESS_SCOPE` removido em produção
- [ ] Métodos antigos do `argus-client.ts` limpos
