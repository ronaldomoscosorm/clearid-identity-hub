-- =====================================================================
-- Campos personalizados do cliente VYLOR (terceirizados).
-- Origem: Downloads/terceiros.csv (57 campos, ~5 seções).
-- storage='supabase' → só local, não vai pro ClearID.
-- Obrigatoriedade (S/N do CSV) NÃO vai aqui — é definida por site em
-- site_custom_fields (tela "Campos do site" do frontend).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Seções (agrupamento visual)
-- ---------------------------------------------------------------------
insert into public.custom_field_sections (profile, section_name, display_name, display_index, storage) values
  ('Vylor', 'VylorEmpresa',        'Empresa (Terceirização)',   1, 'supabase'),
  ('Vylor', 'VylorDadosPessoais',  'Dados Pessoais',            2, 'supabase'),
  ('Vylor', 'VylorDocumentos',     'Documentos Pessoais',       3, 'supabase'),
  ('Vylor', 'VylorSST',            'Saúde e Segurança do Trabalho', 4, 'supabase'),
  ('Vylor', 'VylorNRs',            'Normas Regulamentadoras',   5, 'supabase'),
  ('Vylor', 'VylorCursosSeguros',  'Cursos e Seguros',          6, 'supabase')
on conflict (profile, section_name) do nothing;

-- ---------------------------------------------------------------------
-- 2) Campos
--    - custom_field_name em snake_case (é chave técnica).
--    - display_name em jsonb ({"default": "..."}).
--    - custom_field_type mapeado do CSV:
--        Data           → Date
--        Texto          → Text
--        Número         → Numeric
--        Flegar/Clicar  → Boolean
--        Imagem         → Text + attachment_enabled=true + accept=image/*
-- ---------------------------------------------------------------------
insert into public.custom_field_definitions
  (profile, custom_field_name, display_name, custom_field_type, section_name, storage,
   attachment_enabled, attachment_accept)
values

-- ==== SEÇÃO 1: EMPRESA ====
('Vylor','vy_form_qualificacao',       '{"default":"Formulário de Qualificação"}'::jsonb,                        'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_razao_social',            '{"default":"Razão Social"}'::jsonb,                                      'Text',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_cartao_cnpj',             '{"default":"Cartão CNPJ"}'::jsonb,                                       'Numeric', 'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_cnd_federais',            '{"default":"Certidão Negativa de Débitos Federais"}'::jsonb,             'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_crf_fgts',                '{"default":"Certidão de Regularidade do FGTS"}'::jsonb,                  'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_pgr',                     '{"default":"PGR – Programa de Gerenciamento de Riscos"}'::jsonb,         'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_pcmso',                   '{"default":"PCMSO – Programa de Controle Médico da Saúde Ocupacional"}'::jsonb, 'Date', 'VylorEmpresa',   'supabase', false, null),
('Vylor','vy_ltcat',                   '{"default":"LTCAT – Laudo Técnico das Condições Ambientais de Trabalho"}'::jsonb, 'Date', 'VylorEmpresa', 'supabase', false, null),
('Vylor','vy_contrato_social',         '{"default":"Contrato Social / última alteração contratual"}'::jsonb,     'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_apolice_seg_coletivo',    '{"default":"Apólice de seguro de vida dos colaboradores"}'::jsonb,       'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_comprov_seg_coletivo',    '{"default":"Comprovante de Pagamento do Seguro de Vida"}'::jsonb,        'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_vencimento_contrato',     '{"default":"Data de vencimento do Contrato"}'::jsonb,                    'Date',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_subcontratada',           '{"default":"Subcontratada"}'::jsonb,                                     'Boolean', 'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_email_responsavel',       '{"default":"Email (Responsável da empresa)"}'::jsonb,                    'Text',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_tel_emergencia',          '{"default":"Contato de emergência (Telefone do responsável)"}'::jsonb,   'Text',    'VylorEmpresa',       'supabase', false, null),
('Vylor','vy_responsavel_contrato',    '{"default":"Responsável pelo Contrato (Vylor)"}'::jsonb,                 'Text',    'VylorEmpresa',       'supabase', false, null),

-- ==== SEÇÃO 2: DADOS PESSOAIS ====
('Vylor','vy_nome_registro',           '{"default":"Nome de Registro Completo"}'::jsonb,                         'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_nome_social',             '{"default":"Nome Social"}'::jsonb,                                       'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_sexo',                    '{"default":"Sexo"}'::jsonb,                                              'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_naturalidade',            '{"default":"Naturalidade"}'::jsonb,                                      'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_nacionalidade',           '{"default":"Nacionalidade"}'::jsonb,                                     'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_data_nascimento',         '{"default":"Data de nascimento"}'::jsonb,                                'Date',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_estado_civil',            '{"default":"Estado Civil"}'::jsonb,                                      'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_empresa',                 '{"default":"Empresa"}'::jsonb,                                           'Text',    'VylorDadosPessoais', 'supabase', false, null),
('Vylor','vy_cargo',                   '{"default":"Cargo"}'::jsonb,                                             'Text',    'VylorDadosPessoais', 'supabase', false, null),

-- ==== SEÇÃO 3: DOCUMENTOS PESSOAIS ====
('Vylor','vy_cpf',                     '{"default":"CPF"}'::jsonb,                                               'Numeric', 'VylorDocumentos',    'supabase', false, null),
('Vylor','vy_rg',                      '{"default":"RG"}'::jsonb,                                                'Numeric', 'VylorDocumentos',    'supabase', false, null),
('Vylor','vy_cnh',                     '{"default":"CNH – Carteira Nacional de Habilitação"}'::jsonb,            'Numeric', 'VylorDocumentos',    'supabase', false, null),
('Vylor','vy_foto',                    '{"default":"Foto"}'::jsonb,                                              'Text',    'VylorDocumentos',    'supabase', true,  'image/*'),

-- ==== SEÇÃO 4: SAÚDE E SEGURANÇA DO TRABALHO ====
('Vylor','vy_aso',                     '{"default":"ASO (Atestado de Saúde Ocupacional)"}'::jsonb,               'Date',    'VylorSST',           'supabase', false, null),
('Vylor','vy_ficha_registro',          '{"default":"Ficha de Registro ou Contrato de prestação de serviço"}'::jsonb, 'Boolean', 'VylorSST',       'supabase', false, null),
('Vylor','vy_ficha_epi',               '{"default":"Ficha de entrega de EPI’s (Equipamento de Proteção Individual)"}'::jsonb, 'Date', 'VylorSST', 'supabase', false, null),
('Vylor','vy_integracao_seguranca',    '{"default":"Integração de Segurança"}'::jsonb,                           'Date',    'VylorSST',           'supabase', false, null),

-- ==== SEÇÃO 5: NORMAS REGULAMENTADORAS ====
('Vylor','vy_nr06',                    '{"default":"NR 06 – Equipamento de Proteção Individual"}'::jsonb,        'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr10',                    '{"default":"NR 10 – Segurança em Eletricidade"}'::jsonb,                 'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr11_plataformas',        '{"default":"NR 11 – Operação de Plataformas elevatórias"}'::jsonb,       'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr11_empilhadeiras',      '{"default":"NR 11 – Operação de Empilhadeiras"}'::jsonb,                 'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr11_munks',              '{"default":"NR 11 – Operação de Munks e Guindastes"}'::jsonb,            'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr12',                    '{"default":"NR 12 – Segurança em Máquinas e Equipamentos"}'::jsonb,      'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr18',                    '{"default":"NR 18 – Trabalho na Industria de Construção"}'::jsonb,       'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr20_basico',             '{"default":"NR 20 – Líquidos e combustíveis inflamáveis (Básico)"}'::jsonb, 'Date', 'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr20_intermediario',      '{"default":"NR 20 – Líquidos e combustíveis inflamáveis (Intermediário)"}'::jsonb, 'Date', 'VylorNRs',    'supabase', false, null),
('Vylor','vy_nr23',                    '{"default":"NR 23 – Proteção contra incêndios"}'::jsonb,                 'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr25',                    '{"default":"NR 25 – Resíduos industriais"}'::jsonb,                      'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr26',                    '{"default":"NR 26 – Sinalização de segurança e produtos químicos"}'::jsonb, 'Date', 'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr31_7',                  '{"default":"NR 31.7 – Prevenção com agrotóxicos e adjuvantes"}'::jsonb,  'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr31_12',                 '{"default":"NR 31.12 – Operação de Máquinas Agrícolas"}'::jsonb,         'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr33',                    '{"default":"NR 33 – Trabalhos em Espaços Confinados"}'::jsonb,           'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr34_5',                  '{"default":"NR 34.5 – Segurança com Trabalho a quente"}'::jsonb,         'Date',    'VylorNRs',           'supabase', false, null),
('Vylor','vy_nr35',                    '{"default":"NR 35 – Trabalhos em Altura"}'::jsonb,                       'Date',    'VylorNRs',           'supabase', false, null),

-- ==== SEÇÃO 6: CURSOS E SEGUROS ====
('Vylor','vy_mopp',                    '{"default":"MOPP – Movimentação Operacional de Produtos Perigosos"}'::jsonb, 'Date','VylorCursosSeguros', 'supabase', false, null),
('Vylor','vy_curso_vigilante',         '{"default":"Curso de Vigilante"}'::jsonb,                                'Date',    'VylorCursosSeguros', 'supabase', false, null),
('Vylor','vy_curso_transp_passageiros','{"default":"Curso de Transporte de Passageiros"}'::jsonb,                'Date',    'VylorCursosSeguros', 'supabase', false, null),
('Vylor','vy_apolice_seg_individual',  '{"default":"Apólice de Seguro de Vida Individual"}'::jsonb,              'Date',    'VylorCursosSeguros', 'supabase', false, null),
('Vylor','vy_comprov_seg_individual',  '{"default":"Comprovante de Pagamento do Seguro de Vida Individual"}'::jsonb, 'Date','VylorCursosSeguros', 'supabase', false, null)

on conflict (profile, custom_field_name) do nothing;

-- ---------------------------------------------------------------------
-- 3) Verificação — conte tudo
-- ---------------------------------------------------------------------
-- select section_name, count(*) from public.custom_field_definitions
--  where profile='Vylor' group by section_name order by 1;
