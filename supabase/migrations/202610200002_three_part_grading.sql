-- Add mixed answer keys while preserving existing exam/template versions.
alter table public.exam_questions add column question_type text not null default 'mcq' check(question_type in ('mcq','true_false','short_answer'));
alter table public.exam_questions add column true_false_scoring text not null default 'partial' check(true_false_scoring in ('partial','per_item'));
alter table public.answer_keys drop constraint answer_keys_correct_answer_check;
alter table public.answer_keys add constraint answer_keys_correct_answer_check check(correct_answer ~ '^([A-E]|[TF]{4}|-?[0-9]+([.,][0-9]+)?)$');
alter table public.submission_answers drop constraint submission_answers_status_check;
alter table public.submission_answers add constraint submission_answers_status_check check(status in ('correct','partial','incorrect','blank','multiple','review'));

create function public.valid_short_answer(value text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(value ~ '^-?[0-9]+([.,][0-9]+)?$' and length(regexp_replace(value,'[-.,]','','g')) between 1 and 4,false)
$$;

-- Reuse the strict original common-field validators with checked MCQ projections.
alter function public.validate_answer_document(jsonb) rename to validate_mcq_answer_document;
create function public.validate_answer_document(d jsonb) returns void language plpgsql set search_path='' as $$
declare sheet jsonb; section jsonb; q jsonb; proxy_sheets jsonb:='[]'; proxy_sections jsonb; proxy_questions jsonb; ns integer[]; mcq integer[]; tf integer[]; numeric_q integer[]; n integer; counter integer; kind text; answer text;
begin
 if not exists(select 1 from jsonb_array_elements(d->'answer_sheets') s cross join lateral jsonb_array_elements(s->'sections') sec(value) where sec.value->>'type' is distinct from 'mcq') then
  perform public.validate_mcq_answer_document(d); return;
 end if;
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  proxy_sections:='[]'; ns:='{}'; mcq:='{}'; tf:='{}'; numeric_q:='{}'; counter:=0;
  for section in select value from jsonb_array_elements(sheet->'sections') loop
   kind:=section->>'type';
   if kind is null or kind not in ('mcq','true_false','short_answer') or not public.json_keys_allowed(section,array['type','title','choices','questions','scoring']) then raise exception 'Unsupported question section'; end if;
   if section ? 'scoring' and (kind<>'true_false' or section->>'scoring' is null or section->>'scoring' not in ('partial','per_item')) then raise exception 'Invalid true-false scoring'; end if;
   if kind<>'mcq' and (section->>'choices')::integer is distinct from 4 then raise exception 'Mixed section requires four items or digit columns'; end if;
   proxy_questions:='[]';
   for q in select value from jsonb_array_elements(section->'questions') loop
    n:=(q->>'number')::integer; answer:=q->>'correct_answer';
    if n is null or n=any(ns) then raise exception 'Invalid or duplicate question'; end if; ns:=array_append(ns,n);
    if kind='mcq' then
     mcq:=array_append(mcq,n);
    elsif kind='true_false' then
     tf:=array_append(tf,n); if answer is null or answer !~ '^[TF]{4}$' then raise exception 'Invalid true-false answer'; end if;
    else
     numeric_q:=array_append(numeric_q,n); if not public.valid_short_answer(answer) then raise exception 'Invalid short answer'; end if;
    end if;
    counter:=counter+1;
    proxy_questions:=proxy_questions||jsonb_build_array(q||jsonb_build_object('number',counter,'correct_answer',case when kind='mcq' then answer else 'A' end));
   end loop;
   proxy_sections:=proxy_sections||jsonb_build_array((section-'scoring')||jsonb_build_object('type','mcq','questions',proxy_questions));
  end loop;
  if cardinality(mcq)>40 or cardinality(tf)>8 or cardinality(numeric_q)>6 or exists(select 1 from unnest(mcq) x(val) where x.val<1 or x.val>cardinality(mcq)) or exists(select 1 from unnest(tf) x(val) where x.val<41 or x.val>40+cardinality(tf)) or exists(select 1 from unnest(numeric_q) x(val) where x.val<49 or x.val>48+cardinality(numeric_q)) then raise exception 'Mixed question numbers or capacity mismatch'; end if;
  proxy_sheets:=proxy_sheets||jsonb_build_array(sheet||jsonb_build_object('sections',proxy_sections));
 end loop;
 perform public.validate_mcq_answer_document(jsonb_set(d,'{answer_sheets}',proxy_sheets));
end $$;

create function public.validate_mark_position(b jsonb) returns void language plpgsql set search_path='' as $$ begin
 if not public.json_keys_allowed(b,array['x','y','radius']) or (b->>'x')::numeric is null or (b->>'y')::numeric is null or (b->>'radius')::numeric is null or (b->>'radius')::numeric not between .002 and .05 or (b->>'x')::numeric not between 0 and 1 or (b->>'y')::numeric not between 0 and 1 then raise exception 'Invalid mixed bubble position'; end if;
end $$;

alter function public.validate_template(jsonb) rename to validate_mcq_template;
create function public.validate_template(t jsonb) returns void language plpgsql set search_path='' as $$
declare q jsonb; item jsonb; b jsonb; col jsonb; layout jsonb; proxy jsonb:='[]'; kind text; labels text[];
begin
 for q in select value from jsonb_array_elements(t->'questions') loop
  kind:=coalesce(q->>'section','mcq');
  if kind='mcq' then proxy:=proxy||jsonb_build_array(q); continue; end if;
  if not public.json_keys_allowed(q,array['number','section','bubbles','true_false_items','short_answer']) or jsonb_typeof(q->'bubbles') is distinct from 'array' or jsonb_array_length(q->'bubbles')<>0 then raise exception 'Invalid mixed template question'; end if;
  if kind='true_false' then
   if q ? 'short_answer' or jsonb_typeof(q->'true_false_items') is distinct from 'array' or jsonb_array_length(q->'true_false_items')<>4 then raise exception 'Invalid true-false geometry'; end if;
   labels:='{}';
   for item in select value from jsonb_array_elements(q->'true_false_items') loop
    if not public.json_keys_allowed(item,array['label','true','false']) then raise exception 'Invalid true-false item'; end if;
    labels:=array_append(labels,item->>'label'); perform public.validate_mark_position(item->'true'); perform public.validate_mark_position(item->'false');
   end loop;
   if labels is distinct from array['a','b','c','d'] then raise exception 'Invalid true-false labels'; end if;
  elsif kind='short_answer' then
   layout:=q->'short_answer';
   if q ? 'true_false_items' or not public.json_keys_allowed(layout,array['negative','decimal','columns']) or jsonb_typeof(layout->'decimal') is distinct from 'array' or jsonb_array_length(layout->'decimal')<>3 or jsonb_typeof(layout->'columns') is distinct from 'array' or jsonb_array_length(layout->'columns')<>4 then raise exception 'Invalid short-answer geometry'; end if;
   perform public.validate_mark_position(layout->'negative'); labels:='{}';
   for b in select value from jsonb_array_elements(layout->'decimal') loop
    labels:=array_append(labels,b->>'after_column'); perform public.validate_mark_position(b-'after_column');
   end loop;
   if labels is distinct from array['1','2','3'] then raise exception 'Invalid decimal positions'; end if;
   for col in select value from jsonb_array_elements(layout->'columns') loop
    if jsonb_typeof(col) is distinct from 'array' or jsonb_array_length(col)<>10 then raise exception 'Invalid short-answer column'; end if;
    labels:='{}';
    for b in select value from jsonb_array_elements(col) loop
     labels:=array_append(labels,b->>'label'); perform public.validate_mark_position(b-'label');
    end loop;
    if (select array_agg(x order by x) from unnest(labels) x) is distinct from array['0','1','2','3','4','5','6','7','8','9'] then raise exception 'Invalid short-answer digit labels'; end if;
   end loop;
  else raise exception 'Unsupported template section'; end if;
  proxy:=proxy||jsonb_build_array((q-'true_false_items'-'short_answer')||jsonb_build_object('bubbles',jsonb_build_array(jsonb_build_object('label','A','x',.1,'y',.1,'radius',.005),jsonb_build_object('label','B','x',.2,'y',.1,'radius',.005))));
 end loop;
 perform public.validate_mcq_template(jsonb_set(t,'{questions}',proxy));
end $$;

create or replace function public.save_exam(p_org uuid,p_exam jsonb,p_confirm boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid:=(p_exam->>'id')::uuid; cls uuid:=nullif(p_exam->>'class_id','')::uuid; tv public.template_versions; ev uuid; previous integer; version_number integer:=(p_exam->>'version')::integer; d jsonb:=p_exam->'document'; sheet jsonb; section jsonb; q jsonb; code_id uuid; question_id uuid;
begin
 perform public.validate_answer_document(d);
 if cls is not null and not exists(select 1 from public.classes c where c.id=cls and c.organization_id=p_org and (public.can_class(c.id,true) or exists(select 1 from public.exams e where e.id=eid and e.class_id=c.id and public.can_manage_exam(e.id)))) then raise exception 'Permission denied for class'; end if;
 if exists(select 1 from public.exams where id=eid) then
  if not exists(select 1 from public.exams where id=eid and organization_id=p_org and class_id is not distinct from cls) or not public.can_manage_exam(eid) or not p_confirm then raise exception 'Confirm new version; exam class is immutable'; end if;
 else
  if not public.is_org_admin(p_org) and public.org_role(p_org) is distinct from 'teacher' then raise exception 'Permission denied'; end if;
  insert into public.exams(id,organization_id,class_id,created_by) values(eid,p_org,cls,auth.uid());
 end if;
 perform 1 from public.exams where id=eid for update; select coalesce(max(version),0) into previous from public.exam_versions where exam_id=eid;
 if version_number<>previous+1 then raise exception 'Exam version changed; reload'; end if;
 select * into tv from public.template_versions where organization_id=p_org and template_id=(p_exam->>'template_id')::uuid and version=(p_exam->>'template_version')::integer;
 if not found then raise exception 'Unknown template version'; end if;
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  if (select count(*) from jsonb_array_elements(sheet->'sections') s cross join lateral jsonb_array_elements(s->'questions'))>jsonb_array_length(tv.config->'questions') then raise exception 'Template question count mismatch'; end if;
  for section in select value from jsonb_array_elements(sheet->'sections') loop for q in select value from jsonb_array_elements(section->'questions') loop
   if not exists(select 1 from jsonb_array_elements(tv.config->'questions') tq where (tq->>'number')::integer=(q->>'number')::integer and coalesce(tq->>'section','mcq')=section->>'type' and (section->>'type'<>'mcq' or jsonb_array_length(tq->'bubbles')=(section->>'choices')::integer)) then raise exception 'Template choices mismatch'; end if;
  end loop; end loop;
 end loop;
 insert into public.exam_versions(organization_id,exam_id,version,template_version_id,exam_date,document,created_by) values(p_org,eid,version_number,tv.id,(p_exam->>'date')::date,d,auth.uid()) returning id into ev;
 insert into public.grading_rules(organization_id,exam_version_id) values(p_org,ev);
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  insert into public.exam_codes(organization_id,exam_version_id,code) values(p_org,ev,sheet->>'exam_code') returning id into code_id;
  for section in select value from jsonb_array_elements(sheet->'sections') loop for q in select value from jsonb_array_elements(section->'questions') loop
   insert into public.exam_questions(organization_id,exam_code_id,number,section_title,choices,question_type,true_false_scoring) values(p_org,code_id,(q->>'number')::integer,coalesce(section->>'title',''),(section->>'choices')::integer,section->>'type',coalesce(section->>'scoring','partial')) returning id into question_id;
   insert into public.answer_keys values(p_org,question_id,q->>'correct_answer',(q->>'points')::numeric);
  end loop; end loop;
 end loop;
 perform public.log_event(p_org,'exam.version',eid,jsonb_build_object('version',version_number));
end $$;



create or replace function public.calculate_grade(p_version uuid,p_code text,p_marks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare question_row record; m jsonb; selected jsonb; labels text[]; mark_state text; answer_status text; value text; earned numeric; fraction numeric; correct_count integer; result jsonb:='[]'; total numeric:=0; expected integer; n integer;
begin
 select count(*) into expected from public.exam_questions q join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code;
 if expected=0 then raise exception 'Unknown exam code'; end if;
 if jsonb_typeof(p_marks) is distinct from 'array' then raise exception 'Answer count mismatch'; end if;
 select coalesce(jsonb_agg(mk.value),'[]'::jsonb) into p_marks from jsonb_array_elements(p_marks) mk
 where exists(select 1 from public.exam_questions q join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code and q.number=(mk.value->>'number')::integer);
 if jsonb_array_length(p_marks)<>expected then raise exception 'Answer count mismatch'; end if;
 select count(distinct (mk.value->>'number')::integer) into n from jsonb_array_elements(p_marks) mk;
 if n<>expected then raise exception 'Duplicate question'; end if;
 for question_row in select q.number,q.choices,q.question_type,q.true_false_scoring,k.correct_answer,k.points from public.exam_questions q join public.answer_keys k on k.question_id=q.id join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code order by q.number loop
  select mk.value into m from jsonb_array_elements(p_marks) mk where (mk.value->>'number')::integer=question_row.number;
  if m is null or not public.json_keys_allowed(m,array['number','selected','state','confidence','ratios','reviewed','status','correct_answer','earned','points']) then raise exception 'Invalid recognition'; end if;
  selected:=m->'selected';
  if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected)>question_row.choices then raise exception 'Invalid selected choices'; end if;
  mark_state:=m->>'state';
  if mark_state is null or mark_state not in ('marked','blank','multiple') or (jsonb_array_length(selected)>1 and not coalesce((m->>'reviewed')::boolean,false)) or (mark_state='blank' and jsonb_array_length(selected)<>0) or (mark_state='marked' and jsonb_array_length(selected)<>1) or (mark_state='multiple' and jsonb_array_length(selected)<2) then raise exception 'Review all uncertain answers'; end if;
  if coalesce((m->>'confidence')::numeric,-1) not between 0 and 1 or jsonb_typeof(m->'ratios') is distinct from 'array' then raise exception 'Invalid confidence'; end if;
  if exists(select 1 from jsonb_array_elements(selected) entry where jsonb_typeof(entry)<>'string') then raise exception 'Invalid selected value'; end if;
  select array_agg(x) into labels from jsonb_array_elements_text(selected) x;
  if (select count(distinct x) from unnest(labels) x)<>coalesce(cardinality(labels),0) then raise exception 'Invalid or duplicate choice'; end if;
  value:=selected->>0; fraction:=0;
  if question_row.question_type='mcq' then
   if exists(select 1 from unnest(labels) x where length(x)<>1 or position(x in left('ABCDE',question_row.choices))=0) then raise exception 'Invalid selected choices'; end if;
   if jsonb_array_length(selected)=1 and value=question_row.correct_answer then fraction:=1; end if;
  elsif question_row.question_type='true_false' then
   if jsonb_array_length(selected)>1 or (value is not null and value !~ '^[TF_]{4}$') then raise exception 'Invalid true-false recognition'; end if;
   select count(*) into correct_count from generate_series(1,4) i where substr(value,i,1)=substr(question_row.correct_answer,i,1);
   fraction:=case when question_row.true_false_scoring='per_item' then correct_count::numeric/4 else (array[0,.1,.25,.5,1]::numeric[])[correct_count+1] end;
  else
   if jsonb_array_length(selected)>1 or (value is not null and not public.valid_short_answer(value)) then raise exception 'Invalid short-answer recognition'; end if;
   if value is not null and replace(value,',','.')::numeric=replace(question_row.correct_answer,',','.')::numeric then fraction:=1; end if;
  end if;
  answer_status:=case when jsonb_array_length(selected)>1 then 'multiple' when jsonb_array_length(selected)=0 then 'blank' when fraction=1 then 'correct' when fraction>0 then 'partial' else 'incorrect' end;
  earned:=case when fraction=1 then question_row.points else round(question_row.points*fraction,4) end; total:=total+earned;
  result:=result||jsonb_build_array(jsonb_build_object('number',question_row.number,'selected',selected,'state',mark_state,'confidence',(m->>'confidence')::numeric,'ratios',m->'ratios','reviewed',coalesce((m->>'reviewed')::boolean,false),'status',answer_status,'correct_answer',question_row.correct_answer,'earned',earned,'points',question_row.points));
 end loop;
 return jsonb_build_object('answers',result,'score',round(total,4));
end $$;

revoke all on function public.valid_short_answer(text), public.validate_answer_document(jsonb), public.validate_template(jsonb), public.validate_mark_position(jsonb) from public,anon,authenticated;
