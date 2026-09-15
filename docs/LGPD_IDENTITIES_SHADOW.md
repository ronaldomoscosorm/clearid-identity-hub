# LGPD — `public.identities` como shadow table

## Contexto

Até esta migração, a tabela `public.identities` no Supabase replicava toda a PII
das identidades do ClearID: nome, e-mail, telefone, endereço, aniversário,
vínculo corporativo (empresa, cargo, departamento, supervisor, site) e dados de
sistema (external id, horizon id, etc.).

**Isso é incompatível com a LGPD**: PII de titular só deve viver na fonte de
verdade (ClearID/Genetec). O Supabase deve conter apenas dados que ele mesmo
gerencia (custom fields por site, anexos, worker_type local, empresas).

## Decisão

`public.identities` vira **shadow table**: só o link (`identity_id` do ClearID)
e metadados locais (`company_id`, `worker_type_id`). Nenhuma coluna nativa de
identity permanece.

A shadow row é necessária porque outras tabelas dependem dela via FK:

- `identity_custom_fields` — valores de campos personalizados
- `identity_attachments` — anexos de campos personalizados
- Vínculos locais: `company_id`, `worker_type_id`

## Colunas mantidas

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `id` | uuid pk | uuid interno (usado por FKs) |
| `identity_id` | text NOT NULL unique | link para o ClearID (fonte de verdade) |
| `account_id` | text | tenant |
| `etag` | text | concorrência otimista (histórico) |
| `is_deleted` | boolean | soft-delete local |
| `company_id` | uuid FK companies | vínculo local |
| `worker_type_id` | uuid FK worker_types | tipo exato (ClearID não distingue) |
| `created_at`, `updated_at` | timestamptz | auditoria |

## Colunas removidas (PII)

Todas essas colunas foram dropadas da tabela — os dados são apagados no drop:

- Identidade: `first_name`, `last_name`, `middle_name`, `display_name`, `email`
- Metadados: `identity_type`, `status`, `description`, `country_code`,
  `culture`, `has_vehicles`, `has_licensed_vehicles`
- Auditoria: `created_by`, `creation_date_utc`, `creation_on_behalf`,
  `last_modified_by`, `last_modification_date_utc`, `ordinal`
- Privados (`privateData` do ClearID): `private_picture_blob_name`,
  `private_birthday`, `private_employee_number`, `private_secondary_email`,
  `private_city_of_residence`, `private_state_of_residence`, `private_zip_code`,
  `private_phone_primary`, `private_phone_secondary`
- Corporativos (`companyData`): `company_name`, `company_job_title`,
  `company_department_name`, `company_supervisor_name`, `company_site_id`,
  `company_worker_type_code`, `company_worker_type_desc`, `company_approvers`
- Sistema (`systemData`): todas as colunas `system_*`

## Deploy — ordem obrigatória

1. **Backup** completo do banco Supabase (`pg_dump` do schema `public`).
2. **Aplicar migration** `supabase/migrations/20260913130000_lgpd_identities_shadow.sql`.
   O `DROP COLUMN` é atômico e purga os dados imediatamente.
3. **Deploy do frontend** (`clearid-identity-hub`) com as alterações de:
   - `src/lib/supabase-mirror.ts` — `mirrorIdentities` só grava shadow row
   - `src/integrations/supabase/types.ts` — schema reduzido
4. **Verificar** que:
   - Listagem de identidades continua funcionando (dados vêm do ClearID)
   - Filtro por tipo de trabalhador continua cruzando pelo `worker_type_id` local
   - Anexos de campos personalizados continuam sendo carregados
5. **VACUUM FULL** opcional em `public.identities` para recuperar espaço em disco
   (não roda dentro da transação da migration — executar manualmente):

   ```sql
   vacuum full public.identities;
   ```

## Rollback

Se algo quebrar antes do deploy do frontend, o rollback consiste em restaurar
o backup do passo 1 (as colunas com PII são recriadas com os dados).

Se algo quebrar após o deploy do frontend, o rollback só do banco não basta —
o frontend novo espera o schema shadow. Faça rollback conjunto do frontend +
banco.

## Purga retroativa de PII fora do Supabase

O drop de colunas apaga PII **no banco atual**. Também considere:

- **Backups anteriores** do Supabase que contenham a versão antiga da tabela:
  retenção conforme política interna; se houver obrigação de purgar,
  regenerar backup limpo depois desta migration e descartar os antigos.
- **Logs do PostgREST** (Supabase Studio > Logs) podem conter payloads com
  PII em `insert`/`upsert`/`update`. Verifique a retenção do plano.
- **Logs de aplicação** do frontend (Sentry, Vercel, etc.) — nenhum
  `console.log` conhecido imprime PII, mas revise stack traces em produção.

## Efeito no backend `.NET` (`ArgusClearId.Api`)

Nenhuma alteração: o backend nunca gravou em `public.identities`. Ele já lê
identity direto do ClearID e usa o Supabase somente para custom fields e
sections (via `SupabaseCustomFieldRepository` / `SupabaseSectionRepository`).

## Efeito nas telas

- **Listagem `/identities/`**: fetch de identity via ClearID API (sem
  mudança), filtro por tipo cruza `worker_type_id` local (mantido).
- **Detalhe `/identities/$id`**: dados vêm do ClearID; company/worker_type
  local continuam sendo lidos do shadow.
- **Formulário de identity**: create/update grava no ClearID e cria a shadow
  row via `mirrorIdentities` (só com o link).
- **Anexos**: continuam funcionando — dependem da FK `identity_attachments.identity_id`
  → `identities.id`, que existe.
