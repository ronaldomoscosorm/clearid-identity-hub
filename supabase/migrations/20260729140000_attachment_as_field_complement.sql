-- =====================================================================
-- Anexo como COMPLEMENTO (comprovante) de um campo personalizado.
--
-- O anexo deixa de ser um "tipo de campo" isolado e passa a ser um atributo
-- opcional de QUALQUER campo personalizado: o campo guarda o valor e o anexo
-- comprova esse valor (ex.: campo "CNH" + foto da CNH). O arquivo continua
-- vinculado à definição do campo (identity_attachments.custom_field_definition_id).
-- =====================================================================

-- Flags por campo (definição). attachment_accept já existe (MIME aceito).
alter table public.custom_field_definitions
  add column if not exists attachment_enabled boolean not null default false;
alter table public.custom_field_definitions
  add column if not exists attachment_required boolean not null default false;

comment on column public.custom_field_definitions.attachment_enabled is
  'true = o campo aceita um anexo comprobatório (complemento). O anexo não existe sem o campo.';
comment on column public.custom_field_definitions.attachment_required is
  'true = o anexo comprobatório é obrigatório ao preencher o campo.';
