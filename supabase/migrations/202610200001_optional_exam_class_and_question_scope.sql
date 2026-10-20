-- A classless exam can grade students from accessible rosters in its organization.
alter table public.exams alter column class_id drop not null;
alter table public.exam_submissions drop constraint exam_submissions_class_id_exam_id_fkey;

-- Keep the student's actual class on submissions, and enforce class-bound exams.
create function public.check_submission_exam_class() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.exams e where e.id=new.exam_id and e.class_id is not null and e.class_id<>new.class_id) then
  raise exception 'Student does not belong to exam class';
 end if;
 return new;
end $$;
revoke all on function public.check_submission_exam_class() from public,anon,authenticated;
create trigger submission_exam_class before insert or update of exam_id,class_id on public.exam_submissions for each row execute function public.check_submission_exam_class();

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
   if not exists(select 1 from jsonb_array_elements(tv.config->'questions') tq where (tq->>'number')::integer=(q->>'number')::integer and jsonb_array_length(tq->'bubbles')=(section->>'choices')::integer) then raise exception 'Template choices mismatch'; end if;
  end loop; end loop;
 end loop;
 insert into public.exam_versions(organization_id,exam_id,version,template_version_id,exam_date,document,created_by) values(p_org,eid,version_number,tv.id,(p_exam->>'date')::date,d,auth.uid()) returning id into ev;
 insert into public.grading_rules(organization_id,exam_version_id) values(p_org,ev);
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  insert into public.exam_codes(organization_id,exam_version_id,code) values(p_org,ev,sheet->>'exam_code') returning id into code_id;
  for section in select value from jsonb_array_elements(sheet->'sections') loop for q in select value from jsonb_array_elements(section->'questions') loop
   insert into public.exam_questions(organization_id,exam_code_id,number,section_title,choices) values(p_org,code_id,(q->>'number')::integer,coalesce(section->>'title',''),(section->>'choices')::integer) returning id into question_id;
   insert into public.answer_keys values(p_org,question_id,q->>'correct_answer',(q->>'points')::numeric);
  end loop; end loop;
 end loop;
 perform public.log_event(p_org,'exam.version',eid,jsonb_build_object('version',version_number));
end $$;

create or replace function public.calculate_grade(p_version uuid,p_code text,p_marks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare question_row record; m jsonb; selected jsonb; labels text[]; state text; status text; earned numeric; result jsonb:='[]'; total numeric:=0; expected integer; n integer;
begin
 select count(*) into expected from public.exam_questions q join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code;
 if expected=0 then raise exception 'Unknown exam code'; end if;
 if jsonb_typeof(p_marks) is distinct from 'array' then raise exception 'Answer count mismatch'; end if;
 -- Keep only questions in this code's answer key before validating or scoring marks.
 select coalesce(jsonb_agg(m.value),'[]'::jsonb) into p_marks from jsonb_array_elements(p_marks) m
 where exists(select 1 from public.exam_questions q join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code and q.number=(m.value->>'number')::integer);
 if jsonb_array_length(p_marks)<>expected then raise exception 'Answer count mismatch'; end if;
 select count(distinct (value->>'number')::integer) into n from jsonb_array_elements(p_marks); if n<>expected then raise exception 'Duplicate question'; end if;
 for question_row in select q.number,q.choices,k.correct_answer,k.points from public.exam_questions q join public.answer_keys k on k.question_id=q.id join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code order by q.number loop
  select value into m from jsonb_array_elements(p_marks) where (value->>'number')::integer=question_row.number;
  if m is null or not public.json_keys_allowed(m,array['number','selected','state','confidence','ratios','reviewed','status','correct_answer','earned','points']) then raise exception 'Invalid recognition'; end if;
  selected:=m->'selected'; if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected)>question_row.choices then raise exception 'Invalid selected choices'; end if;
  select array_agg(x) into labels from jsonb_array_elements_text(selected) x;
  if exists(select 1 from unnest(labels) x where length(x)<>1 or position(x in left('ABCDE',question_row.choices))=0) or (select count(distinct x) from unnest(labels) x)<>coalesce(cardinality(labels),0) then raise exception 'Invalid or duplicate choice'; end if;
  state:=m->>'state'; if state is null or state not in ('marked','blank','multiple') or (jsonb_array_length(selected)>1 and not coalesce((m->>'reviewed')::boolean,false)) or (state='blank' and jsonb_array_length(selected)<>0) or (state='marked' and jsonb_array_length(selected)<>1) or (state='multiple' and jsonb_array_length(selected)<2) then raise exception 'Review all uncertain answers'; end if;
  if coalesce((m->>'confidence')::numeric,-1) not between 0 and 1 or jsonb_typeof(m->'ratios') is distinct from 'array' then raise exception 'Invalid confidence'; end if;
  status:=case when jsonb_array_length(selected)=0 then 'blank' when jsonb_array_length(selected)>1 then 'multiple' when selected->>0=question_row.correct_answer then 'correct' else 'incorrect' end;
  earned:=case when status='correct' then question_row.points else 0 end; total:=total+earned;
  result:=result||jsonb_build_array(jsonb_build_object('number',question_row.number,'selected',selected,'state',state,'confidence',(m->>'confidence')::numeric,'ratios',m->'ratios','reviewed',coalesce((m->>'reviewed')::boolean,false),'status',status,'earned',earned,'points',question_row.points));
 end loop;
 return jsonb_build_object('answers',result,'score',round(total,4));
end $$;

create or replace function public.begin_submission(p_org uuid,p_id uuid,p_exam uuid,p_version integer,p_student uuid,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.exam_submissions; v public.exam_versions; cls uuid; rule_id uuid; base text;
begin
 if not public.can_exam(p_exam,true) or not exists(select 1 from public.exams where id=p_exam and organization_id=p_org) then raise exception 'Permission denied'; end if;
 select * into s from public.exam_submissions where id=p_id for update;
 if found then
  if s.organization_id<>p_org or s.exam_id<>p_exam or s.student_id<>p_student or s.exam_code<>p_code or s.graded_by<>auth.uid() or not exists(select 1 from public.exam_versions where id=s.exam_version_id and version=p_version) then raise exception 'Idempotency key belongs to another submission'; end if;
 else
  select * into v from public.exam_versions where exam_id=p_exam and version=p_version;
  if not found or not exists(select 1 from public.exam_codes where exam_version_id=v.id and code=p_code) then raise exception 'Unknown answer key version or exam code'; end if;
  select class_id into cls from public.exams where id=p_exam;
  if cls is null then
   select class_id into cls from public.students where id=p_student and organization_id=p_org and public.can_class(class_id);
   if not found then raise exception 'Student is not accessible for this exam'; end if;
  elsif not exists(select 1 from public.students where id=p_student and organization_id=p_org and class_id=cls) then raise exception 'Student does not belong to exam class'; end if;
  select id into rule_id from public.grading_rules where exam_version_id=v.id; base:=p_org::text||'/'||p_id::text||'/';
  insert into public.exam_submissions(id,organization_id,exam_id,exam_version_id,template_version_id,grading_rule_id,student_id,class_id,exam_code,max_score,original_path,processed_path,graded_by) values(p_id,p_org,p_exam,v.id,v.template_version_id,rule_id,p_student,cls,p_code,(v.document#>>'{exam,grading_scale}')::numeric,base||'original.png',base||'processed.png',auth.uid()) returning * into s;
  perform public.log_event(p_org,'submission.begin',s.id);
 end if;
 return jsonb_build_object('id',s.id,'original_path',s.original_path,'processed_path',s.processed_path,'completed',s.state='complete');
end $$;

create or replace function public.create_sheet_reference(p_exam uuid,p_student uuid,p_code text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; org uuid; begin
 if not public.can_manage_exam(p_exam) or not exists(select 1 from public.students s join public.exams e on e.organization_id=s.organization_id where e.id=p_exam and s.id=p_student and (e.class_id=s.class_id or (e.class_id is null and public.can_class(s.class_id)))) or not exists(select 1 from public.exam_codes c join public.exam_versions v on v.id=c.exam_version_id where v.exam_id=p_exam and c.code=p_code) then raise exception 'Invalid sheet reference'; end if;
 select organization_id into org from public.exams where id=p_exam; insert into public.sheet_references(organization_id,exam_id,student_id,exam_code,created_by) values(org,p_exam,p_student,p_code,auth.uid()) returning id into result; return result;
end $$;
