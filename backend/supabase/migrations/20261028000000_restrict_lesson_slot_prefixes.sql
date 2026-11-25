-- Restrict lesson and evidence slots in cms_check to official Stage 1, Stage 2, and Stage 3 subject prefixes,
-- and seed Stage 2 (108) and Stage 3 (70) requirements so certificates can be issued across all 3 stages.

create or replace function public.cms_check(k text, slot text, d jsonb, p_publish boolean) returns text
language plpgsql immutable as $$
declare q jsonb; x jsonb; n int; ids text[] := '{}';
begin
  if jsonb_typeof(d) <> 'object' then return 'data_not_object'; end if;
  case k
  when 'lesson' then
    if slot !~ '^(AQ|FQ|TF|HD|SR|TZ|ML|AH|MW|US|MH|WS|OT|AR|QD|CF|AU|IL|TC|NW)-\d{2}$' then return 'bad_slot'; end if;
    if public.cms_blank(d->'title') then return 'title_required'; end if;
    if coalesce((d#>>'{quiz,passPct}')::int, 0) not between 50 and 100 then return 'pass_pct'; end if;
    for q in select * from jsonb_array_elements(coalesce(d#>'{quiz,questions}', '[]')) loop
      n := jsonb_array_length(coalesce(q->'options', '[]'));
      if public.cms_blank(q->'id') or q->>'id' = any (ids) then return 'question_id'; end if;
      ids := ids || (q->>'id');
      if public.cms_blank(q->'q') or n not between 2 and 6 or coalesce((q->>'answer')::int, -1) not between 0 and n - 1 then return 'question_invalid'; end if;
    end loop;
    if p_publish and (jsonb_array_length(coalesce(d->'objectives', '[]')) = 0 or jsonb_array_length(coalesce(d->'sections', '[]')) = 0
                      or jsonb_array_length(coalesce(d#>'{quiz,questions}', '[]')) = 0) then return 'lesson_incomplete'; end if;
  when 'evidence' then
    if slot !~ '^(AQ|FQ|TF|HD|SR|TZ|ML|AH|MW|US|MH|WS|OT|AR|QD|CF|AU|IL|TC|NW)-\d{2}/e\d+$' then return 'bad_slot'; end if;
    if p_publish and (public.cms_blank(d->'text') or public.cms_blank(d->'source')) then return 'source_required'; end if;
  when 'quote' then
    if p_publish and (public.cms_blank(d->'text') or public.cms_blank(d->'scholar') or public.cms_blank(d->'source')) then return 'source_required'; end if;
  when 'vocab' then
    if public.cms_blank(d->'word') or public.cms_blank(d->'meaning') then return 'word_required'; end if;
    if p_publish and (jsonb_array_length(coalesce(d->'ayahs', '[]')) = 0) then return 'source_required'; end if;
  when 'story', 'sharia' then
    if p_publish then
      n := 0;
      for x in select value from jsonb_each(coalesce(d->'sections', '{}')) loop
        if public.cms_blank(x->'text') or public.cms_blank(x->'source') then return 'source_required'; end if;
        n := n + 1;
      end loop;
      if n = 0 then return 'empty'; end if;
    end if;
  when 'adhkar' then
    for x in select * from jsonb_array_elements(coalesce(d->'items', '[]')) loop
      if public.cms_blank(x->'id') or x->>'id' = any (ids) then return 'item_id'; end if;
      ids := ids || (x->>'id');
      if p_publish and (public.cms_blank(x->'text') or public.cms_blank(x->'source') or coalesce((x->>'count')::int, 0) < 1) then return 'source_required'; end if;
    end loop;
    if p_publish and cardinality(ids) = 0 then return 'empty'; end if;
  when 'tafsir' then
    if slot !~ '^\d{1,3}$' or slot::int not between 1 and 114 then return 'bad_slot'; end if;
    if p_publish and (public.cms_blank(d->'intro') or jsonb_array_length(coalesce(d->'themes', '[]')) = 0) then return 'tafsir_incomplete'; end if;
  when 'tajweed' then
    if slot !~ '^\d+$' then return 'bad_slot'; end if;
    if p_publish and (public.cms_blank(d->'title') or public.cms_blank(d->'body')) then return 'empty'; end if;
  when 'drill' then
    if slot !~ '^\d+$' then return 'bad_slot'; end if;
    if p_publish and (public.cms_blank(d->'surah') or public.cms_blank(d->'ayah') or public.cms_blank(d->'rule')
                      or jsonb_array_length(coalesce(d->'options', '[]')) < 2 or coalesce((d->>'answer')::int, -1) < 0) then return 'drill_incomplete'; end if;
  when 'path' then
    if slot not in ('ramadan', 'hajj', 'salah', 'tazkiya') then return 'bad_slot'; end if;
    if p_publish and (public.cms_blank(d->'title') or jsonb_array_length(coalesce(d->'steps', '[]')) = 0) then return 'path_incomplete'; end if;
  when 'map' then
    if slot not in ('tawheed', 'aqeedah', 'taharah', 'recite', 'hadith', 'salah', 'tajweed', 'seerah', 'zakat', 'siyam', 'tafsir',
                    'mustalah', 'muamalat', 'hajj', 'arabic', 'mawarith', 'ahwal', 'usul', 'qada') then return 'bad_slot'; end if;
    if p_publish and jsonb_array_length(coalesce(d->'links', '[]')) = 0 then return 'empty'; end if;
  when 'page' then
    if slot !~ '^[1-9]\d{0,2}$' or slot::int not between 1 and 604 then return 'bad_slot'; end if;
    if p_publish and (jsonb_array_length(coalesce(d->'lines', '[]')) = 0 or jsonb_array_length(coalesce(d->'ayahs', '[]')) = 0) then return 'page_incomplete'; end if;
  when 'book', 'audio' then
    if p_publish and (public.cms_blank(d->'title') or public.cms_blank(d->'author') or public.cms_blank(d->'url')) then return 'source_required'; end if;
  else return 'unknown_kind';
  end case;
  return null;
end;
$$;

update public.stage_requirements set lessons = 108 where stage = 2 and lessons = 0;
update public.stage_requirements set lessons = 70 where stage = 3 and lessons = 0;
