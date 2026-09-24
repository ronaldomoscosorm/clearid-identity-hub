-- =====================================================================
-- Anexo comprobatório em TODAS as Normas Regulamentadoras (Vylor).
-- Aceita PDF e imagens (certificado escaneado).
-- Idempotente: só habilita o attachment nos campos da seção VylorNRs.
-- =====================================================================

update public.custom_field_definitions
   set attachment_enabled = true,
       attachment_accept  = 'application/pdf,image/*'
 where profile      = 'Vylor'
   and section_name = 'VylorNRs';

-- Verificação
-- select custom_field_name, display_name->>'default' as label, attachment_enabled, attachment_accept
--   from public.custom_field_definitions
--  where profile='Vylor' and section_name='VylorNRs'
--  order by custom_field_name;
