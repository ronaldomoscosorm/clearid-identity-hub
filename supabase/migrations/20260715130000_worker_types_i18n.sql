-- ---------------------------------------------------------------------
-- Nome multilíngue dos tipos de trabalhador (mesmo padrão jsonb dos demais
-- textos: {"pt-BR":..., "en-US":..., "es-ES":..., "default":...}).
-- `name` continua como fallback.
-- ---------------------------------------------------------------------
alter table public.worker_types
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

update public.worker_types set name_i18n =
  '{"pt-BR":"Empregado","en-US":"Employee","es-ES":"Empleado","default":"Empregado"}'::jsonb
  where code = 'EMP';

update public.worker_types set name_i18n =
  '{"pt-BR":"Visitante","en-US":"Visitor","es-ES":"Visitante","default":"Visitante"}'::jsonb
  where code = 'VIS';

update public.worker_types set name_i18n =
  '{"pt-BR":"Terceiro","en-US":"Contractor","es-ES":"Tercero","default":"Terceiro"}'::jsonb
  where code = 'TER';

update public.worker_types set name_i18n =
  '{"pt-BR":"Entregador-Motorista","en-US":"Delivery Driver","es-ES":"Repartidor-Conductor","default":"Entregador-Motorista"}'::jsonb
  where code = 'ENT';
