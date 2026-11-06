-- Unicidade dos eventos de acesso garantida pelo banco: chave de deduplicação
-- (tipo, porta, lado, horário em segundos e credencial) preenchida por trigger
-- + restrição única por cliente. Substitui o índice por expressão (que incluía
-- identity_id e permitia o mesmo evento duas vezes: sem e com identidade).
-- A importação insere com `on_conflict=profile,dedupe_key` e ignora o que já existe.
-- (Trigger, e não coluna gerada: extract(epoch from timestamptz) não é imutável.)
alter table public.access_events
  add column if not exists dedupe_key text;

comment on column public.access_events.dedupe_key is
  'md5(tipo|porta|lado|horário em segundos|credencial): único por cliente; o mesmo evento não entra duas vezes.';

create or replace function public.access_events_dedupe_key(
  p_event_type_id uuid, p_door text, p_side text, p_event_timestamp timestamptz, p_credential text)
returns text
language sql
immutable
as $$
  select md5(
    p_event_type_id::text || '|' ||
    p_door || '|' ||
    coalesce(p_side, '') || '|' ||
    (floor(extract(epoch from p_event_timestamp))::bigint)::text || '|' ||
    coalesce(p_credential, '')
  );
$$;

create or replace function public.access_events_set_dedupe_key()
returns trigger
language plpgsql
as $$
begin
  new.dedupe_key := public.access_events_dedupe_key(
    new.event_type_id, new.door, new.side, new.event_timestamp, new.credential);
  return new;
end $$;

drop trigger if exists access_events_set_dedupe_key on public.access_events;
create trigger access_events_set_dedupe_key
  before insert or update of event_type_id, door, side, event_timestamp, credential
  on public.access_events
  for each row execute function public.access_events_set_dedupe_key();

-- Preenche as linhas existentes.
update public.access_events
   set dedupe_key = public.access_events_dedupe_key(event_type_id, door, side, event_timestamp, credential)
 where dedupe_key is null;

alter table public.access_events
  alter column dedupe_key set not null;

drop index if exists public.access_events_dedupe_uix;

-- Se já houver duplicados (carga anterior), mantém o mais antigo (menor id).
delete from public.access_events e
 using public.access_events d
 where d.profile = e.profile
   and d.dedupe_key = e.dedupe_key
   and d.id < e.id;

alter table public.access_events
  drop constraint if exists access_events_profile_dedupe_key_key;
alter table public.access_events
  add constraint access_events_profile_dedupe_key_key unique (profile, dedupe_key);
