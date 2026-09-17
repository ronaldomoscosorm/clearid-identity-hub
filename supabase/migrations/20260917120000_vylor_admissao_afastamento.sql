-- =====================================================================
-- Campos VYLOR usados na importação (de→para do Employer):
--   Data Admissao      -> vy_admissao
--   Inicio Afastamento -> vy_iniafastamento
--   Fim Afastamento    -> vy_fimafastamento
-- Tipo Date, storage='supabase'. Anexo comprobatório habilitado (regra: todo
-- campo de data permite anexo). Idempotente (on conflict do nothing + update).
-- =====================================================================

insert into public.custom_field_definitions
  (profile, custom_field_name, display_name, custom_field_type, section_name, storage)
values
  ('Vylor','vy_admissao',       '{"default":"Data de Admissão"}'::jsonb,     'Date', 'VylorDadosPessoais', 'supabase'),
  ('Vylor','vy_iniafastamento', '{"default":"Início do Afastamento"}'::jsonb, 'Date', 'VylorDadosPessoais', 'supabase'),
  ('Vylor','vy_fimafastamento', '{"default":"Fim do Afastamento"}'::jsonb,    'Date', 'VylorDadosPessoais', 'supabase')
on conflict (profile, custom_field_name) do nothing;

-- Habilita anexo comprobatório nos 3 campos de data.
update public.custom_field_definitions
   set attachment_enabled = true,
       attachment_accept  = 'application/pdf,image/*'
 where profile = 'Vylor'
   and custom_field_name in ('vy_admissao', 'vy_iniafastamento', 'vy_fimafastamento');
