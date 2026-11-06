-- Catálogo de filtros do relatório de eventos de acesso: valores distintos de
-- porta, área e home site já presentes nos eventos do cliente (profile).
-- Roda como o chamador (respeita a RLS de access_events).
create or replace function public.access_events_catalog(p_profile text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'doors', coalesce((
      select jsonb_agg(d order by d)
      from (select distinct door as d from public.access_events where profile = p_profile) x), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(a order by a)
      from (select distinct area_name as a from public.access_events
            where profile = p_profile and area_name is not null) x), '[]'::jsonb),
    'sites', coalesce((
      select jsonb_agg(s order by s)
      from (select distinct home_site_name as s from public.access_events
            where profile = p_profile and home_site_name is not null) x), '[]'::jsonb)
  );
$$;

comment on function public.access_events_catalog(text) is
  'Portas, áreas e home sites distintos dos eventos de acesso do cliente (filtros do relatório).';

grant execute on function public.access_events_catalog(text) to authenticated;
