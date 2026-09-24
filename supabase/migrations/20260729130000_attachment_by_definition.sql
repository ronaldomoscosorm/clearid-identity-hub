-- =====================================================================
-- Anexos vinculados à DEFINIÇÃO do campo personalizado (sistema),
-- não mais ao campo do site (site_custom_field_id).
--
-- Motivo: campos personalizados (incl. Anexo) são POR SISTEMA. O arquivo
-- anexado a uma pessoa passa a pertencer à definição do campo, ficando único
-- por (identidade, definição) — independente do site.
-- =====================================================================

-- 1) Nova coluna: vínculo com a definição do campo (sistema).
alter table public.identity_attachments
  add column if not exists custom_field_definition_id uuid
    references public.custom_field_definitions (id) on delete cascade;

-- 2) Backfill a partir do campo do site atualmente vinculado.
update public.identity_attachments a
  set custom_field_definition_id = scf.definition_id
  from public.site_custom_fields scf
  where a.site_custom_field_id = scf.id
    and a.custom_field_definition_id is null;

-- 3) Remove anexos órfãos (campo do site apagado → sem definição resolvível).
delete from public.identity_attachments
  where custom_field_definition_id is null;

-- 4) Remove a UNIQUE antiga (identity_id, site_custom_field_id, version),
--    seja qual for o nome gerado pelo Postgres.
do $$
declare c text;
begin
  select con.conname into c
  from pg_constraint con
  where con.conrelid = 'public.identity_attachments'::regclass
    and con.contype = 'u'
    and (select attname from pg_attribute
         where attrelid = con.conrelid and attnum = con.conkey[2]) = 'site_custom_field_id';
  if c is not null then
    execute format('alter table public.identity_attachments drop constraint %I', c);
  end if;
end $$;

-- 5) Remove o índice parcial antigo (uma versão atual por site_custom_field).
drop index if exists public.ia_current_uix;
drop index if exists public.ia_scf_idx;

-- 6) Dedup defensivo: se a mesma definição tinha "atual" via sites diferentes,
--    mantém como atual só a versão mais recente por (identidade, definição).
with ranked as (
  select id,
         row_number() over (
           partition by identity_id, custom_field_definition_id
           order by version desc, created_at desc
         ) as rn
  from public.identity_attachments
  where is_current
)
update public.identity_attachments a
  set is_current = false
  from ranked r
  where a.id = r.id and r.rn > 1;

-- 7) Re-sequencia versões por (identidade, definição) para evitar colisão
--    (antes eram numeradas por site_custom_field).
with renum as (
  select id,
         row_number() over (
           partition by identity_id, custom_field_definition_id
           order by version asc, created_at asc
         ) as new_version
  from public.identity_attachments
)
update public.identity_attachments a
  set version = r.new_version
  from renum r
  where a.id = r.id;

-- 8) Torna o vínculo com a definição obrigatório e o do site opcional (histórico).
alter table public.identity_attachments
  alter column custom_field_definition_id set not null;
alter table public.identity_attachments
  alter column site_custom_field_id drop not null;

-- 9) Novos índices/único por (identidade, definição).
create index if not exists ia_definition_idx
  on public.identity_attachments (custom_field_definition_id);

alter table public.identity_attachments
  add constraint identity_attachments_identity_definition_version_key
  unique (identity_id, custom_field_definition_id, version);

create unique index if not exists ia_current_by_def_uix
  on public.identity_attachments (identity_id, custom_field_definition_id)
  where is_current;
