create function public.log_event(p_org uuid,p_action text,p_entity uuid,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$ insert into public.audit_logs(organization_id,actor,action,entity_id,details) values(p_org,auth.uid(),p_action,p_entity,p_details) $$;
create function public.json_keys_allowed(p_value jsonb,p_keys text[]) returns boolean language sql immutable set search_path='' as $$ select coalesce(jsonb_typeof(p_value)='object' and not exists(select 1 from jsonb_object_keys(p_value) k where not k=any(p_keys)),false) $$;
create function public.validate_answer_document(d jsonb) returns void language plpgsql set search_path='' as $$
declare sheet jsonb; section jsonb; q jsonb; codes text[]:='{}'; numbers integer[]; code text; n integer; choice_count integer; total numeric; scale numeric;
begin
 if not public.json_keys_allowed(d,array['schema_version','exam','answer_sheets']) or d->>'schema_version' is distinct from '1.0' or not public.json_keys_allowed(d->'exam',array['title','subject','grading_scale']) or length(trim(coalesce(d#>>'{exam,title}',''))) not between 1 and 150 or length(trim(coalesce(d#>>'{exam,subject}',''))) not between 1 and 80 then raise exception 'Invalid answer document'; end if;
 scale:=(d#>>'{exam,grading_scale}')::numeric; if scale is null or scale<=0 or scale>100 then raise exception 'Invalid grading scale'; end if;
 if jsonb_typeof(d->'answer_sheets') is distinct from 'array' or jsonb_array_length(d->'answer_sheets') not between 1 and 100 then raise exception 'Missing exam codes'; end if;
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  if not public.json_keys_allowed(sheet,array['exam_code','sections']) then raise exception 'Unknown answer sheet field'; end if;
  code:=sheet->>'exam_code'; if code is null or code !~ '^[A-Za-z0-9_-]{1,20}$' or code=any(codes) then raise exception 'Invalid or duplicate exam code'; end if; codes:=array_append(codes,code); numbers:='{}'; total:=0;
  if jsonb_typeof(sheet->'sections') is distinct from 'array' or jsonb_array_length(sheet->'sections') not between 1 and 20 then raise exception 'Invalid sections'; end if;
  for section in select value from jsonb_array_elements(sheet->'sections') loop
   choice_count:=(section->>'choices')::integer;
   if not public.json_keys_allowed(section,array['type','title','choices','questions']) or section->>'type' is distinct from 'mcq' or choice_count is null or choice_count not between 2 and 5 or jsonb_typeof(section->'questions') is distinct from 'array' or jsonb_array_length(section->'questions') not between 1 and 500 then raise exception 'Unsupported question section'; end if;
   for q in select value from jsonb_array_elements(section->'questions') loop
    n:=(q->>'number')::integer;
    if not public.json_keys_allowed(q,array['number','correct_answer','points']) or n is null or n not between 1 and 500 or n=any(numbers) or q->>'correct_answer' is null or position(q->>'correct_answer' in left('ABCDE',choice_count))=0 or length(q->>'correct_answer')<>1 or (q->>'points')::numeric is null or (q->>'points')::numeric<=0 or (q->>'points')::numeric>100 then raise exception 'Invalid or duplicate question'; end if;
    numbers:=array_append(numbers,n); total:=total+(q->>'points')::numeric;
   end loop;
  end loop;
  if cardinality(numbers)>500 or (select max(x) from unnest(numbers) x)<>cardinality(numbers) or abs(total-scale)>.0001 then raise exception 'Question count or maximum score mismatch'; end if;
 end loop;
end $$;
create function public.validate_template(t jsonb) returns void language plpgsql set search_path='' as $$
declare q jsonb; b jsonb; a jsonb; col jsonb; region jsonb; labels text[]; n integer:=0; w integer; h integer;
begin
 if not public.json_keys_allowed(t,array['id','name','code','version','width','height','anchors','questions','student_region','code_region','qr_region','thresholds','active','tested_version','test_note']) or length(trim(coalesce(t->>'name',''))) not between 1 and 120 or t->>'code' is null or t->>'code' !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Invalid template'; end if;
 if jsonb_typeof(t->'anchors') is distinct from 'array' or jsonb_typeof(t->'questions') is distinct from 'array' or jsonb_typeof(t->'width') is distinct from 'number' or jsonb_typeof(t->'height') is distinct from 'number' or jsonb_typeof(t->'version') is distinct from 'number' or jsonb_typeof(t->'active') is distinct from 'boolean' or jsonb_typeof(t->'test_note') is distinct from 'string' or not (t ? 'tested_version') then raise exception 'Missing template fields'; end if;
 w:=(t->>'width')::integer; h:=(t->>'height')::integer;
 if w is null or h is null or w not between 400 and 3000 or h not between 400 and 4000 or (t->>'version')::integer<1 or jsonb_array_length(t->'anchors')<>4 or jsonb_array_length(t->'questions') not between 1 and 500 then raise exception 'Invalid template geometry'; end if;
 for a in select value from jsonb_array_elements(t->'anchors') loop
  if not public.json_keys_allowed(a,array['x','y']) or (a->>'x')::numeric is null or (a->>'y')::numeric is null or (a->>'x')::numeric not between 0 and 1 or (a->>'y')::numeric not between 0 and 1 then raise exception 'Invalid anchor'; end if;
 end loop;
 for q in select value from jsonb_array_elements(t->'questions') loop
  n:=n+1; labels:='{}'; if not public.json_keys_allowed(q,array['number','section','bubbles']) or (q->>'number')::integer is distinct from n or jsonb_array_length(q->'bubbles') not between 2 and 5 then raise exception 'Invalid template question'; end if;
  for b in select value from jsonb_array_elements(q->'bubbles') loop
   if not public.json_keys_allowed(b,array['label','x','y','radius']) or b->>'label' is null or b->>'label' not in ('A','B','C','D','E') or b->>'label'=any(labels) or (b->>'x')::numeric is null or (b->>'y')::numeric is null or (b->>'radius')::numeric is null or (b->>'x')::numeric not between 0 and 1 or (b->>'y')::numeric not between 0 and 1 or (b->>'radius')::numeric not between .002 and .05 then raise exception 'Invalid bubble'; end if; labels:=array_append(labels,b->>'label');
  end loop;
 end loop;
 for region in select value from jsonb_each(t) where key in ('student_region','code_region') loop
  if jsonb_array_length(region) not between 1 and 12 then raise exception 'Invalid digit region'; end if;
  for col in select value from jsonb_array_elements(region) loop
   if jsonb_array_length(col)<>10 then raise exception 'Invalid digit column'; end if; labels:='{}';
   for b in select value from jsonb_array_elements(col) loop
    if not public.json_keys_allowed(b,array['label','x','y','radius']) or b->>'label' is null or b->>'label' !~ '^\d$' or b->>'label'=any(labels) or (b->>'x')::numeric is null or (b->>'y')::numeric is null or (b->>'radius')::numeric is null or (b->>'x')::numeric not between 0 and 1 or (b->>'y')::numeric not between 0 and 1 or (b->>'radius')::numeric not between .002 and .05 then raise exception 'Invalid digit bubble'; end if; labels:=array_append(labels,b->>'label');
   end loop;
  end loop;
 end loop;
 if not public.json_keys_allowed(t->'thresholds',array['filled','ambiguous','min_gap']) or coalesce((t#>>'{thresholds,filled}')::numeric,0) not between .1 and .95 or coalesce((t#>>'{thresholds,ambiguous}')::numeric,-1) not between 0 and .9 or (t#>>'{thresholds,ambiguous}')::numeric >= (t#>>'{thresholds,filled}')::numeric or coalesce((t#>>'{thresholds,min_gap}')::numeric,0) not between .01 and 1 then raise exception 'Invalid thresholds'; end if;
 if t ? 'qr_region' then
  a:=t->'qr_region';
  if not public.json_keys_allowed(a,array['x','y','width','height']) or coalesce((a->>'x')::numeric,-1)<0 or coalesce((a->>'y')::numeric,-1)<0 or coalesce((a->>'width')::numeric,0)<=0 or coalesce((a->>'height')::numeric,0)<=0 or (a->>'x')::numeric+(a->>'width')::numeric>1 or (a->>'y')::numeric+(a->>'height')::numeric>1 then raise exception 'Invalid QR region'; end if;
 end if;
 if coalesce((t->>'active')::boolean,false) and (t->>'tested_version')::integer is distinct from (t->>'version')::integer then raise exception 'Test version before activation'; end if;
end $$;

create function public.my_organizations() returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',public.org_role(o.id)) order by o.name),'[]') from public.organizations o where public.org_role(o.id) is not null $$;
create function public.create_organization(p_name text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.organizations(name,created_by) values(trim(p_name),auth.uid()) returning id into result;
 insert into public.organization_members values(result,auth.uid(),'school_admin'); perform public.log_event(result,'organization.create',result); return result;
end $$;
create function public.create_invitation(p_org uuid,p_role public.app_role) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
 if not public.is_org_admin(p_org) or p_role='platform_admin' then raise exception 'Permission denied'; end if;
 insert into public.organization_invitations(organization_id,role,created_by) values(p_org,p_role,auth.uid()) returning id into result; perform public.log_event(p_org,'invitation.create',result,jsonb_build_object('role',p_role)); return result;
end $$;
create function public.accept_invitation(p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$ declare invite public.organization_invitations; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into invite from public.organization_invitations where id=p_token for update;
 if not found or invite.accepted_by is not null or invite.expires_at<now() then raise exception 'Invalid or expired invitation'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.organization_members values(invite.organization_id,auth.uid(),invite.role) on conflict do nothing;
 update public.organization_invitations set accepted_by=auth.uid(),accepted_at=now() where id=p_token; perform public.log_event(invite.organization_id,'invitation.accept',p_token); return invite.organization_id;
end $$;
create function public.list_members(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if public.org_role(p_org) is null then raise exception 'Permission denied'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'display_name',coalesce(p.display_name,''))),'[]') from public.organization_members m left join public.profiles p on p.id=m.user_id where m.organization_id=p_org);
end $$;
create function public.assign_class(p_org uuid,p_class uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_org_admin(p_org) or not exists(select 1 from public.classes where id=p_class and organization_id=p_org) or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and role='teacher') then raise exception 'Invalid teacher assignment'; end if;
 insert into public.class_members values(p_org,p_class,p_user) on conflict do nothing; perform public.log_event(p_org,'class.assign',p_class,jsonb_build_object('user_id',p_user));
end $$;
create function public.assign_exam(p_org uuid,p_exam uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_org_admin(p_org) or not exists(select 1 from public.exams where id=p_exam and organization_id=p_org) or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user) then raise exception 'Invalid exam assignment'; end if;
 insert into public.exam_assignments values(p_org,p_exam,p_user,auth.uid()) on conflict do nothing; perform public.log_event(p_org,'exam.assign',p_exam,jsonb_build_object('user_id',p_user));
end $$;
create function public.save_class(p_org uuid,p_class jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid:=(p_class->>'id')::uuid; teacher uuid:=coalesce((p_class->>'teacher_id')::uuid,auth.uid()); begin
 if not public.is_org_admin(p_org) and (public.org_role(p_org) is distinct from 'teacher' or teacher<>auth.uid()) then raise exception 'Permission denied'; end if;
 if exists(select 1 from public.classes where id=result) then raise exception 'Class already exists'; end if;
 insert into public.classes(id,organization_id,name,year,created_by) values(result,p_org,trim(p_class->>'name'),p_class->>'year',auth.uid());
 if exists(select 1 from public.organization_members where organization_id=p_org and user_id=teacher and role='teacher') then insert into public.class_members values(p_org,result,teacher); elsif teacher<>auth.uid() then raise exception 'Teacher is not a member'; end if;
 perform public.log_event(p_org,'class.create',result); return result;
end $$;
create function public.add_students(p_org uuid,p_students jsonb) returns void language plpgsql security definer set search_path='' as $$ declare s jsonb; begin
 if jsonb_typeof(p_students)<>'array' or jsonb_array_length(p_students) not between 1 and 1000 then raise exception 'Invalid roster'; end if;
 for s in select value from jsonb_array_elements(p_students) loop
  if not exists(select 1 from public.classes where id=(s->>'class_id')::uuid and organization_id=p_org and public.can_class(id,true)) then raise exception 'Permission denied'; end if;
  insert into public.students(id,organization_id,class_id,number,name,created_by) values((s->>'id')::uuid,p_org,(s->>'class_id')::uuid,s->>'number',trim(s->>'name'),auth.uid());
 end loop;
 perform public.log_event(p_org,'students.import',null,jsonb_build_object('count',jsonb_array_length(p_students)));
end $$;
create function public.save_template(p_org uuid,p_template jsonb) returns void language plpgsql security definer set search_path='' as $$ declare tid uuid:=(p_template->>'id')::uuid; ver integer:=(p_template->>'version')::integer; previous integer; begin
 if not public.is_org_admin(p_org) then raise exception 'Permission denied'; end if; perform public.validate_template(p_template);
 if exists(select 1 from public.answer_sheet_templates where id=tid and organization_id<>p_org) then raise exception 'Template belongs to another organization'; end if;
 insert into public.answer_sheet_templates(id,organization_id,code,created_by) values(tid,p_org,p_template->>'code',auth.uid()) on conflict(id) do nothing;
 perform 1 from public.answer_sheet_templates where id=tid for update;
 if not exists(select 1 from public.answer_sheet_templates where id=tid and code=p_template->>'code') then raise exception 'Template code is immutable; create a copy'; end if;
 select coalesce(max(version),0) into previous from public.template_versions where template_id=tid;
 if ver<>previous+1 then raise exception 'Template version changed; reload'; end if;
 insert into public.template_versions(organization_id,template_id,version,config,created_by) values(p_org,tid,ver,p_template,auth.uid()); perform public.log_event(p_org,'template.version',tid,jsonb_build_object('version',ver));
end $$;
create function public.save_exam(p_org uuid,p_exam jsonb,p_confirm boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid:=(p_exam->>'id')::uuid; cls uuid:=(p_exam->>'class_id')::uuid; tv public.template_versions; ev uuid; previous integer; version_number integer:=(p_exam->>'version')::integer; d jsonb:=p_exam->'document'; sheet jsonb; section jsonb; q jsonb; code_id uuid; question_id uuid;
begin
 perform public.validate_answer_document(d);
 if not exists(select 1 from public.classes c where c.id=cls and c.organization_id=p_org and (public.can_class(c.id,true) or exists(select 1 from public.exams e where e.id=eid and e.class_id=c.id and public.can_manage_exam(e.id)))) then raise exception 'Permission denied for class'; end if;
 if exists(select 1 from public.exams where id=eid) then
  if not exists(select 1 from public.exams where id=eid and organization_id=p_org and class_id=cls) or not public.can_manage_exam(eid) or not p_confirm then raise exception 'Confirm new version; exam class is immutable'; end if;
 else
  if not public.is_org_admin(p_org) and public.org_role(p_org) is distinct from 'teacher' then raise exception 'Permission denied'; end if;
  insert into public.exams(id,organization_id,class_id,created_by) values(eid,p_org,cls,auth.uid());
 end if;
 perform 1 from public.exams where id=eid for update; select coalesce(max(version),0) into previous from public.exam_versions where exam_id=eid;
 if version_number<>previous+1 then raise exception 'Exam version changed; reload'; end if;
 select * into tv from public.template_versions where organization_id=p_org and template_id=(p_exam->>'template_id')::uuid and version=(p_exam->>'template_version')::integer;
 if not found then raise exception 'Unknown template version'; end if;
 for sheet in select value from jsonb_array_elements(d->'answer_sheets') loop
  if (select count(*) from jsonb_array_elements(sheet->'sections') s cross join lateral jsonb_array_elements(s->'questions'))<>jsonb_array_length(tv.config->'questions') then raise exception 'Template question count mismatch'; end if;
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

create function public.submission_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'exam_id',s.exam_id,'exam_version',v.version,'template_id',tv.template_id,'template_version',tv.version,'student_id',s.student_id,'student_number',st.number,'student_name',st.name,'class_id',s.class_id,'exam_code',s.exam_code,'score',s.score,'max_score',s.max_score,'created_at',s.created_at,'graded_by',s.graded_by,'revision',s.revision,'original_path',s.original_path,'processed_path',s.processed_path,
 'answers',coalesce((select jsonb_agg(jsonb_build_object('number',a.number,'selected',a.selected,'state',a.state,'confidence',a.confidence,'ratios',a.ratios,'reviewed',a.reviewed,'status',a.status,'earned',a.earned,'points',a.points) order by a.number) from public.submission_answers a where a.submission_id=s.id),'[]'),
 'history',coalesce((select jsonb_agg(jsonb_build_object('at',h.created_at,'score',h.score,'actor',h.actor,'reason',h.reason) order by h.revision) from public.grading_history h where h.submission_id=s.id),'[]'))
 from public.exam_submissions s join public.exam_versions v on v.id=s.exam_version_id join public.template_versions tv on tv.id=s.template_version_id join public.students st on st.id=s.student_id where s.id=p_id and public.can_exam(s.exam_id)
$$;
create function public.get_workspace(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if public.org_role(p_org) is null then raise exception 'Permission denied'; end if;
 return jsonb_build_object(
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'year',c.year)) from public.classes c where c.organization_id=p_org and public.can_class(c.id)),'[]'),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'number',s.number,'name',s.name) order by s.number) from public.students s where s.organization_id=p_org and public.can_class(s.class_id)),'[]'),
 'templates',coalesce((select jsonb_agg(t.config order by t.version) from public.template_versions t where t.organization_id=p_org),'[]'),
 'exams',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'class_id',e.class_id,'template_id',t.template_id,'template_version',t.version,'date',v.exam_date,'version',v.version,'version_id',v.id,'created_by',e.created_by,'document',case when public.can_exam(e.id,true) then v.document else jsonb_set(v.document,'{answer_sheets}','[]') end) order by v.version) from public.exams e join public.exam_versions v on v.exam_id=e.id join public.template_versions t on t.id=v.template_version_id where e.organization_id=p_org and public.can_exam(e.id)),'[]'),
 'submissions',coalesce((select jsonb_agg(public.submission_json(s.id) order by s.created_at desc) from public.exam_submissions s where s.organization_id=p_org and s.state='complete' and public.can_exam(s.exam_id)),'[]'));
end $$;

create function public.calculate_grade(p_version uuid,p_code text,p_marks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare question_row record; m jsonb; selected jsonb; labels text[]; state text; status text; earned numeric; result jsonb:='[]'; total numeric:=0; expected integer; n integer;
begin
 select count(*) into expected from public.exam_questions q join public.exam_codes c on c.id=q.exam_code_id where c.exam_version_id=p_version and c.code=p_code;
 if expected=0 then raise exception 'Unknown exam code'; end if;
 if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks)<>expected then raise exception 'Answer count mismatch'; end if;
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
create function public.begin_submission(p_org uuid,p_id uuid,p_exam uuid,p_version integer,p_student uuid,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not exists(select 1 from public.students where id=p_student and organization_id=p_org and class_id=cls) then raise exception 'Student does not belong to exam class'; end if;
  select id into rule_id from public.grading_rules where exam_version_id=v.id; base:=p_org::text||'/'||p_id::text||'/';
  insert into public.exam_submissions(id,organization_id,exam_id,exam_version_id,template_version_id,grading_rule_id,student_id,class_id,exam_code,max_score,original_path,processed_path,graded_by) values(p_id,p_org,p_exam,v.id,v.template_version_id,rule_id,p_student,cls,p_code,(v.document#>>'{exam,grading_scale}')::numeric,base||'original.png',base||'processed.png',auth.uid()) returning * into s;
  perform public.log_event(p_org,'submission.begin',s.id);
 end if;
 return jsonb_build_object('id',s.id,'original_path',s.original_path,'processed_path',s.processed_path,'completed',s.state='complete');
end $$;
create function public.apply_grade(p_id uuid,p_marks jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.exam_submissions; result jsonb; a jsonb;
begin
 select * into s from public.exam_submissions where id=p_id for update; result:=public.calculate_grade(s.exam_version_id,s.exam_code,p_marks);
 delete from public.submission_answers where submission_id=p_id;
 for a in select value from jsonb_array_elements(result->'answers') loop
  insert into public.submission_answers values(s.organization_id,s.id,(a->>'number')::integer,a->'selected',a->>'state',(a->>'confidence')::numeric,a->'ratios',(a->>'reviewed')::boolean,a->>'status',(a->>'earned')::numeric,(a->>'points')::numeric);
 end loop;
 update public.exam_submissions set state='complete',score=(result->>'score')::numeric,completed_at=now(),revision=revision+1,graded_by=auth.uid() where id=p_id returning * into s;
 insert into public.grading_history(organization_id,submission_id,revision,exam_version_id,score,actor,reason,snapshot) values(s.organization_id,s.id,s.revision,s.exam_version_id,s.score,auth.uid(),p_reason,result);
 perform public.log_event(s.organization_id,'submission.grade',s.id,jsonb_build_object('revision',s.revision,'score',s.score));
end $$;
create function public.finalize_submission(p_id uuid,p_marks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare s public.exam_submissions; begin
 select * into s from public.exam_submissions where id=p_id for update;
 if not found or s.graded_by<>auth.uid() or not public.can_exam(s.exam_id,true) then raise exception 'Permission denied'; end if;
 if s.state='complete' then return public.submission_json(p_id); end if;
 if (select count(*) from storage.objects where bucket_id='answer-sheets' and name in(s.original_path,s.processed_path))<>2 then raise exception 'Upload both images before finalizing'; end if;
 perform public.apply_grade(p_id,p_marks,'Chấm lần đầu'); return public.submission_json(p_id);
end $$;
create function public.regrade_submission(p_id uuid,p_org uuid,p_version integer,p_revision integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$ declare s public.exam_submissions; v public.exam_versions; marks jsonb; begin
 select * into s from public.exam_submissions where id=p_id for update;
 if not found or s.organization_id<>p_org or not public.can_exam(s.exam_id,true) then raise exception 'Permission denied'; end if;
 if s.state<>'complete' or s.revision<>p_revision then raise exception 'Revision changed; reload'; end if;
 if length(trim(p_reason)) not between 5 and 1000 then raise exception 'Provide regrade reason'; end if;
 select * into v from public.exam_versions where exam_id=s.exam_id and version=p_version;
 if not found or v.template_version_id<>s.template_version_id then raise exception 'Template changed; rescan required'; end if;
 select jsonb_agg(jsonb_build_object('number',number,'selected',selected,'state',state,'confidence',confidence,'ratios',ratios,'reviewed',reviewed)) into marks from public.submission_answers where submission_id=p_id;
 update public.exam_submissions set exam_version_id=v.id,grading_rule_id=(select id from public.grading_rules where exam_version_id=v.id),max_score=(v.document#>>'{exam,grading_scale}')::numeric where id=p_id;
 perform public.apply_grade(p_id,marks,p_reason); return public.submission_json(p_id);
end $$;
create function public.create_sheet_reference(p_exam uuid,p_student uuid,p_code text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; org uuid; begin
 if not public.can_manage_exam(p_exam) or not exists(select 1 from public.students s join public.exams e on e.class_id=s.class_id where e.id=p_exam and s.id=p_student) or not exists(select 1 from public.exam_codes c join public.exam_versions v on v.id=c.exam_version_id where v.exam_id=p_exam and c.code=p_code) then raise exception 'Invalid sheet reference'; end if;
 select organization_id into org from public.exams where id=p_exam; insert into public.sheet_references(organization_id,exam_id,student_id,exam_code,created_by) values(org,p_exam,p_student,p_code,auth.uid()) returning id into result; return result;
end $$;
create function public.validate_sheet_reference(p_reference uuid,p_exam uuid,p_student_number text default null,p_code text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare r record; begin
 if not public.can_exam(p_exam,true) then raise exception 'Permission denied'; end if;
 select ref.*,s.number into r from public.sheet_references ref join public.students s on s.id=ref.student_id where ref.id=p_reference and ref.exam_id=p_exam;
 if not found or (p_student_number is not null and r.number<>p_student_number) or (p_code is not null and r.exam_code<>p_code) then raise exception 'Invalid QR reference'; end if;
 return jsonb_build_object('student_number',r.number,'exam_code',r.exam_code);
end $$;

-- Never expose internal SECURITY DEFINER helpers or validators through the Data API.
do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['is_platform_admin','org_role','is_org_admin','can_exam','can_class','can_manage_exam','log_event','json_keys_allowed','validate_answer_document','validate_template','my_organizations','create_organization','create_invitation','accept_invitation','list_members','assign_class','assign_exam','save_class','add_students','save_template','save_exam','submission_json','get_workspace','calculate_grade','begin_submission','apply_grade','finalize_submission','regrade_submission','create_sheet_reference','validate_sheet_reference']) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop; end $$;
grant execute on function public.is_platform_admin(), public.org_role(uuid), public.is_org_admin(uuid), public.can_exam(uuid,boolean), public.can_class(uuid,boolean), public.can_manage_exam(uuid) to authenticated;
grant execute on function public.my_organizations(),public.create_organization(text),public.create_invitation(uuid,public.app_role),public.accept_invitation(uuid),public.list_members(uuid),public.assign_class(uuid,uuid,uuid),public.assign_exam(uuid,uuid,uuid),public.save_class(uuid,jsonb),public.add_students(uuid,jsonb),public.save_template(uuid,jsonb),public.save_exam(uuid,jsonb,boolean),public.get_workspace(uuid),public.begin_submission(uuid,uuid,uuid,integer,uuid,text),public.finalize_submission(uuid,jsonb),public.regrade_submission(uuid,uuid,integer,integer,text),public.create_sheet_reference(uuid,uuid,text),public.validate_sheet_reference(uuid,uuid,text,text) to authenticated;
