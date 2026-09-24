-- ---------------------------------------------------------------------
-- Novo tipo de trabalhador: Entregador-Motorista.
--
-- Mapeamento Argus: "Terceiros" (o workerTypeCode do ClearID só aceita
-- "Colaborador" ou "Terceiros"; apenas Empregado é Colaborador).
-- A distinção exata do tipo é preservada por identities.worker_type_id.
-- ---------------------------------------------------------------------
insert into public.worker_types (code, name, argus_worker_type_code, display_index)
values ('ENT', 'Entregador-Motorista', 'Terceiros', 4)
on conflict (code) do nothing;
