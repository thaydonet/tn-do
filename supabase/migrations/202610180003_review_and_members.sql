create table public.review_issues (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, exam_id uuid not null,
 kind text not null check(kind in ('qr','student','template','image')), message text not null check(length(message) between 1 and 1000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 resolved_by uuid references auth.users(id), resolved_at timestamptz,
 foreign key(organization_id,exam_id) references public.exams(organization_id,id)
);
alter table public.review_issues enable row level security;
revoke all on public.review_issues from anon,authenticated;
grant select on public.review_issues to authenticated;
create policy issue_read on public.review_issues for select to authenticated using(public.can_exam(exam_id));
create index issue_exam_idx on public.review_issues(exam_id,resolved_at,created_at);
create function public.record_review_issue(p_org uuid,p_exam uuid,p_kind text,p_message text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
 if not public.can_exam(p_exam,true) or not exists(select 1 from public.exams where id=p_exam and organization_id=p_org) then raise exception 'Permission denied'; end if;
 insert into public.review_issues(organization_id,exam_id,kind,message,created_by) values(p_org,p_exam,p_kind,left(p_message,1000),auth.uid()) returning id into result; return result;
end $$;
create function public.get_review_issues(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if public.org_role(p_org) is null then raise exception 'Permission denied'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]') from public.review_issues i where i.organization_id=p_org and public.can_exam(i.exam_id));
end $$;
create function public.resolve_review_issue(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare org uuid; eid uuid; begin
 select organization_id,exam_id into org,eid from public.review_issues where id=p_id;
 if eid is null or not public.can_exam(eid,true) then raise exception 'Permission denied'; end if;
 update public.review_issues set resolved_by=auth.uid(),resolved_at=now() where id=p_id and resolved_at is null; perform public.log_event(org,'review.resolve',p_id);
end $$;
create function public.set_member_role(p_org uuid,p_user uuid,p_role public.app_role) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_org_admin(p_org) or p_role='platform_admin' then raise exception 'Permission denied'; end if;
 -- Serialize admin changes to prevent concurrent removal of every school administrator.
 perform 1 from public.organizations where id=p_org for update;
 if not public.is_org_admin(p_org) then raise exception 'Permission denied'; end if;
 if p_role<>'school_admin' and exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_user and role='school_admin') and (select count(*) from public.organization_members where organization_id=p_org and role='school_admin')<=1 then raise exception 'Keep at least one school administrator'; end if;
 update public.organization_members set role=p_role where organization_id=p_org and user_id=p_user;
 if not found then raise exception 'Member not found'; end if;
 perform public.log_event(p_org,'member.role',p_user,jsonb_build_object('role',p_role));
end $$;
create function public.revoke_assignment(p_org uuid,p_user uuid,p_class uuid default null,p_exam uuid default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_org_admin(p_org) then raise exception 'Permission denied'; end if;
 if p_class is not null then delete from public.class_members where organization_id=p_org and class_id=p_class and user_id=p_user; end if;
 if p_exam is not null then delete from public.exam_assignments where organization_id=p_org and exam_id=p_exam and user_id=p_user; end if;
 perform public.log_event(p_org,'assignment.revoke',coalesce(p_class,p_exam),jsonb_build_object('user_id',p_user));
end $$;
revoke all on function public.record_review_issue(uuid,uuid,text,text),public.get_review_issues(uuid),public.resolve_review_issue(uuid),public.set_member_role(uuid,uuid,public.app_role),public.revoke_assignment(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_review_issue(uuid,uuid,text,text),public.get_review_issues(uuid),public.resolve_review_issue(uuid),public.set_member_role(uuid,uuid,public.app_role),public.revoke_assignment(uuid,uuid,uuid,uuid) to authenticated;

-- Index tenant filters and FK joins, including tables whose natural PK starts elsewhere.
do $$ declare t text; begin foreach t in array array['organization_invitations','class_members','students','classes','answer_sheet_templates','template_versions','exams','exam_versions','exam_codes','exam_questions','answer_keys','grading_rules','exam_assignments','exam_submissions','submission_answers','grading_history','review_issues','sheet_references'] loop execute format('create index %I on public.%I(organization_id)',t||'_org_idx',t); end loop; end $$;
