-- =====================================================================
-- Campos personalizados do cliente VYLOR — aba "Terceiros" (DocumentosVylor.xlsx).
-- 32 campos. storage='supabase' (só local, não vai pro ClearID).
-- Idempotente: on conflict do nothing (não duplica os que já existem).
--
-- Tipos: Texto→Text, Número→Numeric, Data→Date, Flegar/Clicar→Boolean.
-- Obrigatoriedade (✔ na planilha) NÃO é definida aqui — é por cliente/tipo em
-- site_custom_fields (tela "Campos do cliente"). Campos ✔: Naturalidade,
-- Nacionalidade, Estado Civil, Integração de Segurança.
-- =====================================================================

-- Seções (agrupamento visual) — cria se ainda não existir.
insert into public.custom_field_sections (profile, section_name, display_name, display_index, storage) values
  ('Vylor', 'VylorDadosPessoais', 'Dados Pessoais',                2, 'supabase'),
  ('Vylor', 'VylorDocumentos',    'Documentos Pessoais',           3, 'supabase'),
  ('Vylor', 'VylorSST',           'Saúde e Segurança do Trabalho', 4, 'supabase'),
  ('Vylor', 'VylorNRs',           'Normas Regulamentadoras',       5, 'supabase'),
  ('Vylor', 'VylorCursosSeguros', 'Cursos e Seguros',              6, 'supabase')
on conflict (profile, section_name) do nothing;

insert into public.custom_field_definitions
  (profile, custom_field_name, display_name, custom_field_type, section_name, storage)
values
-- ==== Dados pessoais ====
('Vylor','vy_naturalidade',        '{"default":"Naturalidade"}'::jsonb,                'Text',    'VylorDadosPessoais', 'supabase'),
('Vylor','vy_nacionalidade',       '{"default":"Nacionalidade"}'::jsonb,               'Text',    'VylorDadosPessoais', 'supabase'),
('Vylor','vy_estado_civil',        '{"default":"Estado Civil"}'::jsonb,                'Text',    'VylorDadosPessoais', 'supabase'),
-- ==== Documentos ====
('Vylor','vy_cpf',                 '{"default":"CPF"}'::jsonb,                          'Numeric', 'VylorDocumentos',    'supabase'),
('Vylor','vy_rg',                  '{"default":"RG"}'::jsonb,                           'Numeric', 'VylorDocumentos',    'supabase'),
('Vylor','vy_cnh',                 '{"default":"CNH - Carteira Nacional de Habilitação"}'::jsonb, 'Numeric', 'VylorDocumentos', 'supabase'),
-- ==== Saúde e Segurança ====
('Vylor','vy_aso',                 '{"default":"ASO (Atestado de Saúde Ocupacional)"}'::jsonb,     'Date',    'VylorSST', 'supabase'),
('Vylor','vy_ficha_registro',      '{"default":"Ficha de Registro ou Contrato de prestação de serviço"}'::jsonb, 'Boolean', 'VylorSST', 'supabase'),
('Vylor','vy_ficha_epi',           '{"default":"Ficha de entrega de EPI''s (Equipamento de Proteção Individual)"}'::jsonb, 'Date', 'VylorSST', 'supabase'),
('Vylor','vy_integracao_seguranca','{"default":"Integração de Segurança"}'::jsonb,      'Date',    'VylorSST', 'supabase'),
-- ==== Normas Regulamentadoras ====
('Vylor','vy_nr06',                '{"default":"NR 06 – Equipamento de Proteção Individual"}'::jsonb,         'Date','VylorNRs','supabase'),
('Vylor','vy_nr10',                '{"default":"NR 10 – Segurança em Eletricidade"}'::jsonb,                 'Date','VylorNRs','supabase'),
('Vylor','vy_nr11_plataformas',    '{"default":"NR 11 - Operação de Plataformas elevatórias"}'::jsonb,       'Date','VylorNRs','supabase'),
('Vylor','vy_nr11_empilhadeiras',  '{"default":"NR 11 - Operação de Empilhadeiras"}'::jsonb,                 'Date','VylorNRs','supabase'),
('Vylor','vy_nr11_munks',          '{"default":"NR 11 - Operação de Munks e Guindastes"}'::jsonb,            'Date','VylorNRs','supabase'),
('Vylor','vy_nr12',                '{"default":"NR 12 - Segurança em Máquinas e Equipamentos"}'::jsonb,      'Date','VylorNRs','supabase'),
('Vylor','vy_nr18',                '{"default":"NR 18 - Trabalho na Industria de Construção"}'::jsonb,       'Date','VylorNRs','supabase'),
('Vylor','vy_nr20_basico',         '{"default":"NR 20 - Líquidos e combustíveis inflamáveis (Curso Básico)"}'::jsonb, 'Date','VylorNRs','supabase'),
('Vylor','vy_nr20_intermediario',  '{"default":"NR 20 - Líquidos e combustíveis inflamáveis (Curso Intermediário)"}'::jsonb, 'Date','VylorNRs','supabase'),
('Vylor','vy_nr23',                '{"default":"NR 23 - Proteção contra incêndios"}'::jsonb,                 'Date','VylorNRs','supabase'),
('Vylor','vy_nr25',                '{"default":"NR 25 – Resíduos industriais"}'::jsonb,                      'Date','VylorNRs','supabase'),
('Vylor','vy_nr26',                '{"default":"NR 26 - Sinalização de segurança e manuseio de produtos químicos"}'::jsonb, 'Date','VylorNRs','supabase'),
('Vylor','vy_nr31_7',              '{"default":"NR 31.7 – Prevenção com agrotóxicos, adjuvantes e afins"}'::jsonb, 'Date','VylorNRs','supabase'),
('Vylor','vy_nr31_12',             '{"default":"NR 31.12 - Operação de Máquinas Agrícolas"}'::jsonb,         'Date','VylorNRs','supabase'),
('Vylor','vy_nr33',                '{"default":"NR 33 – Segurança e Saúde em Espaços Confinados"}'::jsonb,    'Date','VylorNRs','supabase'),
('Vylor','vy_nr34_5',              '{"default":"NR 34.5 – Segurança com Trabalho a quente"}'::jsonb,         'Date','VylorNRs','supabase'),
('Vylor','vy_nr35',                '{"default":"NR 35 – Trabalhos em Altura"}'::jsonb,                       'Date','VylorNRs','supabase'),
-- ==== Cursos e Seguros ====
('Vylor','vy_mopp',                '{"default":"MOPP - Movimentação Operacional de Produtos Perigosos"}'::jsonb, 'Date','VylorCursosSeguros','supabase'),
('Vylor','vy_curso_vigilante',     '{"default":"Curso de Vigilante"}'::jsonb,                                'Date','VylorCursosSeguros','supabase'),
('Vylor','vy_curso_transp_passageiros','{"default":"Curso de Transporte de Passageiros"}'::jsonb,            'Date','VylorCursosSeguros','supabase'),
('Vylor','vy_apolice_seg_individual','{"default":"Apólice de Seguro de Vida Individual"}'::jsonb,            'Date','VylorCursosSeguros','supabase'),
('Vylor','vy_comprov_seg_individual','{"default":"Comprovante de Pagamento do Seguro de Vida Individual"}'::jsonb, 'Date','VylorCursosSeguros','supabase')
on conflict (profile, custom_field_name) do nothing;

-- Todo campo de DATA do Vylor permite anexo comprobatório (imagem ou PDF).
-- Idempotente: roda mesmo que os campos já existissem. Não marca obrigatório o
-- anexo (attachment_required continua false) — só habilita.
update public.custom_field_definitions
set attachment_enabled = true,
    attachment_accept = coalesce(attachment_accept, 'image/*,application/pdf')
where profile = 'Vylor'
  and custom_field_type = 'Date'
  and attachment_enabled = false;
