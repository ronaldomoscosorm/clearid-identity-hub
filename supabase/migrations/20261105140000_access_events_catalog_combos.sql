-- Catálogo de filtros do relatório de eventos com a relação site → área derivada dos
-- próprios eventos do cliente (combinações distintas de home site e área), usada pelo
-- front como reserva quando o ClearID não responde.
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
            where profile = p_profile and home_site_name is not null) x), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(jsonb_build_object('site', c.site, 'area', c.area) order by c.site, c.area)
      from (select distinct home_site_name as site, area_name as area
            from public.access_events
            where profile = p_profile and area_name is not null) c), '[]'::jsonb)
  );
$$;

comment on function public.access_events_catalog(text) is
  'Portas, áreas, home sites e combinações site/área dos eventos de acesso do cliente (filtros do relatório).';

grant execute on function public.access_events_catalog(text) to authenticated;
