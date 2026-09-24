# Frontend — Atualização após LGPD shadow

Guia prático de atualização do `clearid-identity-hub` após a mudança de
`public.identities` para shadow table (só `identity_id` + metadados locais,
sem PII).

Migration relacionada: `supabase/migrations/20260913130000_lgpd_identities_shadow.sql`
Doc conceitual: [`LGPD_IDENTITIES_SHADOW.md`](./LGPD_IDENTITIES_SHADOW.md)

---

## 1. O que já foi alterado no repositório

Nada precisa ser editado — os arquivos abaixo já refletem o novo contrato.
Confira que a sua checkout está atualizada:

| Arquivo | O que mudou |
| --- | --- |
| `supabase/migrations/20260913130000_lgpd_identities_shadow.sql` | Purga + drop de 46 colunas PII; `identity_id` NOT NULL; COMMENTs |
| `src/lib/supabase-mirror.ts` | `mirrorIdentities` grava só shadow row (4 colunas); `toIdentityRow` removido |
| `src/integrations/supabase/types.ts` | `identities.Row/Insert/Update` reduzidos a 9 colunas |

Verificação rápida (deve retornar 0):

```bash
grep -nE "(first_name|last_name|private_[a-z]+|company_name|system_external_id)" \
  src/integrations/supabase/types.ts \
  src/lib/supabase-mirror.ts | \
  grep -v "custom_field\|comment\|//"
```

## 2. Type-check obrigatório

```bash
npx tsc --noEmit
```

Precisa terminar com **exit 0**. Se aparecer erro citando alguma coluna PII
(`first_name`, `private_*`, `company_name`, `system_*`, `status`, etc.),
significa que existe código lendo do Supabase o que agora só vive no ClearID —
troque para pegar do payload da API do ClearID (retorno de
`argus.listIdentities`, `argus.getIdentity`, etc.).

## 3. Pontos do código que continuam válidos (não mexer)

Estes selects já usam só colunas sobreviventes; não requerem alteração:

- `src/components/IdentityForm.tsx:470` — `.select("id, company_id, worker_type_id")`
- `src/lib/attachments.ts:37` — `.select("id")`
- `src/routes/_authenticated/identities.index.tsx:225` — `.select("identity_id, worker_type_id")`

Os callers de `mirrorIdentities` também seguem iguais — apenas o corpo
gravado mudou (agora sem PII):

- `src/lib/identity-atomic.ts:43` — dentro da saga de compensação
- `src/routes/_authenticated/identities.index.tsx:209` — listagem
- `src/routes/_authenticated/identities.$id.tsx:63, 161` — detalhe/update

## 4. Ordem de deploy

**Só faça este deploy em conjunto com a migration.** Se aplicar a migration
sem o frontend novo, o `mirrorIdentities` antigo vai lançar 400 tentando gravar
colunas inexistentes (`first_name`, etc.). Se aplicar o frontend novo sem a
migration, o upsert vai passar (as colunas ainda existem, ficam null), mas
Postgres pode reclamar do `first_name NOT NULL`.

1. **Backup do Supabase** (opção 2 do `docs/BACKUP_SUPABASE.md` — Supabase CLI
   ou `pg_dump`).
2. **Aplicar migration** — via Studio SQL Editor ou `supabase db push`:
   ```bash
   supabase db push
   ```
   Se der erro citando FKs, veja seção **6. Troubleshooting**.
3. **Deploy do frontend** (build + publicação normal do projeto).
4. **Smoke test em produção** — seção 5 abaixo.
5. Opcional: `VACUUM FULL public.identities;` no Studio para recuperar espaço.

## 5. Checklist de smoke test (10 min)

Abrir `clearid.rmtecho.com.br` em cada perfil (Vylor, Corteva, RM) e validar:

### Listagem `/identities/`
- [ ] Nomes, e-mails e cargos aparecem (**vindos do ClearID**, não do Supabase)
- [ ] Filtro por **Tipo de trabalhador** funciona (usa `worker_type_id` local)
- [ ] Filtro por **Empresa** funciona (usa `company_id` local via `IdentityForm`)
- [ ] Paginação continua

### Detalhe `/identities/:id`
- [ ] Todos os campos nativos preenchidos (nome, e-mail, telefone, aniversário, endereço, empresa/cargo/departamento vindos do ClearID)
- [ ] Empresa selecionada corretamente no combo (Supabase)
- [ ] Tipo de trabalhador selecionado corretamente (Supabase)
- [ ] Campos personalizados carregam com os valores certos
- [ ] Anexos de NRs/certidões continuam sendo baixados

### Criação `/identities/new`
- [ ] Salva no ClearID
- [ ] Shadow row aparece no Supabase (`select id, identity_id, company_id, worker_type_id from public.identities order by created_at desc limit 5;`)
- [ ] Campos personalizados/anexos gravam certo

### Edição
- [ ] Update no ClearID reflete
- [ ] Trocar empresa/worker_type persiste na shadow
- [ ] Saga de compensação: se um dos updates falhar, o outro é revertido

### Devtools
- [ ] Nenhum erro **400 Bad Request** em requests para `.../rest/v1/identities`
- [ ] Nenhum warning `column "..." does not exist` no console

## 6. Troubleshooting

**Migration falha com `cannot drop column X because other objects depend on it`**
Alguma view/policy/function criada após o schema v2 referencia uma coluna PII.
Rode antes da migration:
```sql
select dependent_ns.nspname || '.' || dependent_view.relname as dependent_view,
       pg_attribute.attname as column
from pg_depend
join pg_rewrite on pg_depend.objid = pg_rewrite.oid
join pg_class as dependent_view on pg_rewrite.ev_class = dependent_view.oid
join pg_class as source_table on pg_depend.refobjid = source_table.oid
join pg_attribute on pg_depend.refobjid = pg_attribute.attrelid
  and pg_depend.refobjsubid = pg_attribute.attnum
join pg_namespace as dependent_ns on dependent_view.relnamespace = dependent_ns.oid
where source_table.relname = 'identities' and source_table.relnamespace =
  (select oid from pg_namespace where nspname = 'public');
```
Drop das views/policies dependentes, aplique a migration, recrie o que precisar.

**Frontend 400 em `mirrorIdentities`**
Sinal de que o deploy do frontend saiu antes da migration ou vice-versa.
Aplique o par completo (migration + frontend novo).

**Filtro "Tipo de trabalhador" volta vazio**
A migration não afeta `worker_type_id`. Se estiver vazio, é porque as shadow
rows anteriores não tinham `worker_type_id` preenchido — a edição uma vez de
cada identity resolve, ou faça um backfill separado.

**Alguma tela ainda mostra `undefined` para nome/e-mail**
Bug no consumo do payload do ClearID (não vem do Supabase). Verifique se a
tela está lendo `identity.firstName`/`identity.email` (camelCase, ClearID) e
não `identity.first_name`/`identity.email` (snake_case, Supabase antigo).

## 7. Rollback

Rollback só do frontend não é seguro (o schema já mudou). Se precisar reverter:

1. Restaurar o backup do passo 1.
2. `git revert` do commit que trouxe a migration + as mudanças de `supabase-mirror.ts` e `types.ts`.
3. Redeploy do frontend.

O ideal é **não reverter** — apenas patch em cima. A LGPD compliance retroativa
já foi feita ao dropar as colunas; voltar atrás significa gravar PII de novo.
