import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Execute actual migrations/RLS in PostgreSQL WASM. Only Supabase-owned schemas are stubbed.
// TEST_DATABASE_URL instead targets an expendable PostgreSQL database; never a production project.
let db;
if (process.env.TEST_DATABASE_URL) {
  const { Client } = await import('pg'); db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  db.exec = sql => db.query(sql); db.close = () => db.end();
} else db = new PGlite();
let count = 0;
async function test(label, fn) { await fn(); count++; console.log(`PASS ${label}`); }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1), teacher = id(2), other = id(3), examiner = id(4), viewer = id(5), outsider = id(6), platform = id(7);
async function as(user, fn) {
  await db.exec('begin; set local role authenticated;');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]); const result = await fn(); await db.exec('commit'); return result; }
  catch (e) { await db.exec('rollback'); throw e; }
}
async function call(user, name, args = []) {
  return as(user, async () => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args.map(a => typeof a === 'object' && a !== null ? JSON.stringify(a) : a))).rows[0].result);
}
const fails = (promise, regex) => assert.rejects(promise, regex);
const vite = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const user of [admin, teacher, other, examiner, viewer, outsider, platform]) await db.query('insert into auth.users values($1)', [user]);
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await test('all private tables have RLS enabled', async () => { const { rows } = await db.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"); assert.equal(rows.length, 0); });
  const org = await call(admin, 'create_organization', ['Trường A']), otherOrg = await call(outsider, 'create_organization', ['Trường B']);
  for (const [user, role] of [[teacher, 'teacher'], [other, 'teacher'], [examiner, 'examiner'], [viewer, 'viewer']]) {
    const token = await call(admin, 'create_invitation', [org, role]); await call(user, 'accept_invitation', [token]);
    await test(`invitation is single-use (${role})`, () => fails(call(user, 'accept_invitation', [token]), /Invalid or expired/));
  }
  const classA = { id: id(20), name: '12A1', year: '2026-2027', teacher_id: teacher }, classB = { id: id(21), name: '12A2', year: '2026-2027', teacher_id: other };
  await call(admin, 'save_class', [org, classA]); await call(admin, 'save_class', [org, classB]);
  const student = { id: id(30), class_id: classA.id, number: '000001', name: 'Học sinh tổng hợp' };
  await call(teacher, 'add_students', [org, [student]]);
  await test('teacher cannot read another assigned class', async () => { const rows = await as(teacher, () => db.query('select id from public.classes')); assert.deepEqual(rows.rows.map(x => x.id), [classA.id]); });
  await test('teacher cannot import another class roster', () => fails(call(teacher, 'add_students', [org, [{ ...student, id: id(31), class_id: classB.id, number: '000002' }]]), /Permission denied/));
  await test('cross-tenant organization RPC is denied', () => fails(call(teacher, 'get_workspace', [otherOrg]), /Permission denied/));
  await test('direct membership privilege escalation is denied', () => fails(as(teacher, () => db.query("update public.organization_members set role='school_admin' where user_id=$1", [teacher])), /permission denied/i));
  const { createTemplate } = await vite.ssrLoadModule('/src/domain/templates.ts');
  const template = createTemplate(20, id(40));
  await call(admin, 'save_template', [org, template]);
  await test('teachers cannot create template versions', () => fails(call(teacher, 'save_template', [org, { ...template, version: 2 }]), /Permission denied/));
  await test('template versions are immutable', () => fails(call(admin, 'save_template', [org, template]), /version changed/));
  await test('another organization can use the same template code with its own ID', async () => { await call(outsider, 'save_template', [otherOrg, { ...template, id: id(42) }]); assert.equal((await call(outsider, 'get_workspace', [otherOrg])).templates.length, 1); });
  const document = { schema_version: '1.0', exam: { title: 'Kiểm thử', subject: 'Toán', grading_scale: 10 }, answer_sheets: ['101', '102'].map(code => ({ exam_code: code, sections: [{ type: 'mcq', title: 'MCQ', choices: 4, questions: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, correct_answer: code === '101' ? 'A' : 'B', points: .5 })) }] })) };
  const exam = { id: id(50), class_id: classA.id, template_id: template.id, template_version: 1, date: '2026-10-18', document, version: 1 };
  await call(teacher, 'save_exam', [org, exam, false]);
  await test('unassigned teacher cannot read exam or answer keys', async () => { const w = await call(other, 'get_workspace', [org]); assert.equal(w.exams.length, 0); const data = await as(other, () => db.query('select * from public.answer_keys')); assert.equal(data.rows.length, 0); });
  await test('server rejects unknown fields in answer JSON', () => fails(call(teacher, 'save_exam', [org, { ...exam, version: 2, document: { ...document, malicious: true } }, true]), /Invalid answer document/));
  await test('server rejects duplicate questions', async () => { const d = structuredClone(document); d.answer_sheets[0].sections[0].questions[1].number = 1; await fails(call(teacher, 'save_exam', [org, { ...exam, version: 2, document: d }, true]), /Invalid or duplicate question/); });
  await call(admin, 'assign_exam', [org, exam.id, examiner]); await call(admin, 'assign_exam', [org, exam.id, viewer]);
  await test('assigned viewer sees exam metadata without answer keys', async () => { const w = await call(viewer, 'get_workspace', [org]); assert.equal(w.exams[0].document.exam.title, 'Kiểm thử'); assert.equal(w.exams[0].document.answer_sheets.length, 0); assert.equal((await as(viewer, () => db.query('select * from public.answer_keys'))).rows.length, 0); });
  await test('viewer cannot start a submission', () => fails(call(viewer, 'begin_submission', [org, id(60), exam.id, 1, student.id, '101']), /Permission denied/));
  await test('examiner cannot change answer keys', () => fails(call(examiner, 'save_exam', [org, { ...exam, version: 2 }, true]), /Permission denied/));
  await test('unknown code never falls back to first key', () => fails(call(examiner, 'begin_submission', [org, id(60), exam.id, 1, student.id, '999']), /Unknown answer key/));
  const draft = await call(examiner, 'begin_submission', [org, id(60), exam.id, 1, student.id, '102']);
  await test('begin upload is idempotent', async () => assert.deepEqual(await call(examiner, 'begin_submission', [org, id(60), exam.id, 1, student.id, '102']), draft));
  await test('idempotency key cannot change identity', () => fails(call(examiner, 'begin_submission', [org, id(60), exam.id, 1, student.id, '101']), /Idempotency key/));
  await test('second capture cannot duplicate student exam', () => fails(call(examiner, 'begin_submission', [org, id(61), exam.id, 1, student.id, '102']), /unique constraint/));
  const marks = Array.from({ length: 20 }, (_, i) => ({ number: i + 1, selected: ['B'], state: 'marked', confidence: 1, ratios: [0, 1, 0, 0], reviewed: true, earned: 999, points: 999, status: 'incorrect', correct_answer: 'A' }));
  await test('cannot finalize without two uploaded images', () => fails(call(examiner, 'finalize_submission', [draft.id, marks]), /Upload both images/));
  await test('other teacher cannot upload into draft path', () => fails(as(other, () => db.query("insert into storage.objects(bucket_id,name) values('answer-sheets',$1)", [draft.original_path])), /row-level security/));
  await as(examiner, () => db.query("insert into storage.objects(bucket_id,name) values('answer-sheets',$1)", [draft.original_path]));
  await test('interrupted upload remains retryable', () => fails(call(examiner, 'finalize_submission', [draft.id, marks]), /Upload both images/));
  await as(examiner, () => db.query("insert into storage.objects(bucket_id,name) values('answer-sheets',$1)", [draft.processed_path]));
  await test('unresolved recognition is rejected server-side', async () => { const bad = structuredClone(marks); bad[0].state = 'review'; await fails(call(examiner, 'finalize_submission', [draft.id, bad]), /Review all/); });
  await test('multiple bubbles require review', async () => { const bad = structuredClone(marks); bad[0] = { ...bad[0], state: 'multiple', selected: ['A', 'B'], reviewed: false }; await fails(call(examiner, 'finalize_submission', [draft.id, bad]), /Review all/); });
  let submission;
  await test('server ignores forged score and uses code 102 key', async () => { submission = await call(examiner, 'finalize_submission', [draft.id, marks]); assert.equal(submission.score, 10); assert.equal(submission.revision, 1); assert.equal(submission.answers[0].points, .5); });
  await test('finalize retries do not create history duplicates', async () => { const s = await call(examiner, 'finalize_submission', [draft.id, marks]); assert.equal(s.history.length, 1); });
  await test('outsider cannot read private image metadata', async () => assert.equal((await as(outsider, () => db.query('select * from storage.objects'))).rows.length, 0));
  await test('unassigned teacher cannot read submissions', async () => assert.equal((await as(other, () => db.query('select * from public.exam_submissions'))).rows.length, 0));
  await test('assigned viewer can report without mutation permission', async () => { const w = await call(viewer, 'get_workspace', [org]); assert.equal(w.submissions.length, 1); await fails(call(viewer, 'regrade_submission', [draft.id, org, 1, 1, 'Viewer mutation']), /Permission denied/); });
  const changed = structuredClone(document); changed.answer_sheets[1].sections[0].questions[0].correct_answer = 'A';
  await test('used keys require explicit new version confirmation', () => fails(call(teacher, 'save_exam', [org, { ...exam, version: 2, document: changed }, false]), /Confirm new version/));
  await call(teacher, 'save_exam', [org, { ...exam, version: 2, document: changed }, true]);
  await test('saving key does not silently change old scores', async () => { const w = await call(teacher, 'get_workspace', [org]); assert.equal(w.submissions[0].score, 10); assert.equal(w.submissions[0].exam_version, 1); });
  await test('regrade preserves old score and version history', async () => { const s = await call(examiner, 'regrade_submission', [draft.id, org, 2, 1, 'Đổi đáp án câu 1']); assert.equal(s.score, 9.5); assert.equal(s.revision, 2); assert.deepEqual(s.history.map(h => h.score), [10, 9.5]); assert.equal(s.exam_version, 2); });
  await test('concurrent regrade stale revision is rejected', () => fails(call(examiner, 'regrade_submission', [draft.id, org, 2, 1, 'Stale update']), /Revision changed/));
  const ref = await call(teacher, 'create_sheet_reference', [exam.id, student.id, '102']);
  await test('QR references are validated on the server', async () => assert.equal((await call(examiner, 'validate_sheet_reference', [ref, exam.id, '000001', '102'])).student_number, '000001'));
  await test('mismatching QR SBD is rejected', () => fails(call(examiner, 'validate_sheet_reference', [ref, exam.id, '999999', '102']), /Invalid QR/));
  await test('internal definer helpers are inaccessible to clients', () => fails(call(teacher, 'apply_grade', [draft.id, marks, 'Bypass']), /permission denied/i));
  await test('audit events record actual authenticated actor', async () => { const logs = await as(admin, () => db.query("select actor from public.audit_logs where action='submission.grade'")); assert.equal(logs.rows.length, 2); assert.ok(logs.rows.every(r => r.actor === examiner)); });
  await test('malformed template geometry is rejected', () => fails(call(admin, 'save_template', [org, { id: id(41), name: 'Invalid', code: 'BAD', version: 1 }]), /Missing template fields/));
  await test('school cannot have its last administrator demoted', () => fails(call(admin, 'set_member_role', [org, admin, 'viewer']), /at least one/));
  await test('teacher cannot change member roles', () => fails(call(teacher, 'set_member_role', [org, other, 'school_admin']), /Permission denied/));
  await test('school administrator cannot grant platform admin', () => fails(call(admin, 'set_member_role', [org, other, 'platform_admin']), /Permission denied/));
  await test('review issues are visible only to assigned users', async () => { await call(examiner, 'record_review_issue', [org, exam.id, 'qr', 'Mã đề QR không khớp']); assert.equal((await call(viewer, 'get_review_issues', [org])).length, 1); assert.equal((await call(other, 'get_review_issues', [org])).length, 0); });
  const issue = (await call(examiner, 'get_review_issues', [org]))[0];
  await test('viewer cannot resolve review issues', () => fails(call(viewer, 'resolve_review_issue', [issue.id]), /Permission denied/));
  await test('examiner can resolve an assigned review issue', async () => { await call(examiner, 'resolve_review_issue', [issue.id]); assert.ok((await call(examiner, 'get_review_issues', [org]))[0].resolved_at); });
  await test('revoking an exam assignment immediately removes viewer access', async () => { await call(admin, 'revoke_assignment', [org, viewer, null, exam.id]); assert.equal((await call(viewer, 'get_workspace', [org])).submissions.length, 0); });
  await test('role changes immediately remove grading permission', async () => { await call(admin, 'set_member_role', [org, examiner, 'viewer']); await fails(call(examiner, 'regrade_submission', [draft.id, org, 2, 2, 'Role changed']), /Permission denied/); });
  await test('teacher assigned only to exam can maintain its answer versions', async () => { const assignedExam = { ...exam, id: id(51) }; await call(teacher, 'save_exam', [org, assignedExam, false]); await call(admin, 'assign_exam', [org, assignedExam.id, other]); await call(other, 'save_exam', [org, { ...assignedExam, version: 2 }, true]); assert.equal((await call(other, 'get_workspace', [org])).exams.filter(e => e.id === assignedExam.id).length, 2); });
  await test('exam assignment still does not allow modifying class roster', () => fails(call(other, 'add_students', [org, [{ ...student, id: id(32), number: '000003' }]]), /Permission denied/));
  await db.query('insert into public.platform_admins values($1)', [platform]);
  await test('DBA-provisioned platform admin can inspect organizations', async () => assert.equal((await call(platform, 'my_organizations')).length, 2));
  await test('private bucket and storage evidence are immutable', async () => { assert.equal((await db.query("select public from storage.buckets where id='answer-sheets'")).rows[0].public, false); const changed = await as(examiner, () => db.query("update storage.objects set metadata='{\"tampered\":true}' where name=$1 returning id", [draft.original_path])); assert.equal(changed.rows.length, 0); });
  // Optional classes and shorter answer keys must work through the real RPCs/RLS.
  const studentB = { ...student, id: id(33), class_id: classB.id, number: '000004' };
  await call(admin, 'add_students', [org, [studentB]]);
  for (const capacity of [20, 40]) {
    const scopedTemplate = capacity === 20 ? template : createTemplate(40, id(43));
    if (capacity === 40) await call(admin, 'save_template', [org, scopedTemplate]);
    const shortDocument = structuredClone(document);
    shortDocument.answer_sheets.forEach(s => { s.sections[0].questions = s.sections[0].questions.slice(0, 10).map(q => ({ ...q, points: 1 })); });
    const shortExam = { ...exam, id: id(100 + capacity), class_id: null, template_id: scopedTemplate.id, document: shortDocument };
    await test(`teacher saves 10-question classless exam on ${capacity}-question sheet`, async () => {
      await call(teacher, 'save_exam', [org, shortExam, false]);
      const saved = (await call(teacher, 'get_workspace', [org])).exams.find(e => e.id === shortExam.id);
      assert.equal(saved.class_id, null); assert.equal(saved.document.answer_sheets[0].sections[0].questions.length, 10);
    });
    await test(`classless exam preserves null class across versions (${capacity})`, async () => {
      await call(teacher, 'save_exam', [org, { ...shortExam, version: 2 }, true]);
      await fails(call(teacher, 'save_exam', [org, { ...shortExam, class_id: classA.id, version: 3 }, true]), /class is immutable/);
    });
    await test(`classless exam does not expose an inaccessible roster (${capacity})`, async () => {
      assert.ok(!(await call(teacher, 'get_workspace', [org])).students.some(s => s.id === studentB.id));
      await fails(call(teacher, 'begin_submission', [org, id(200 + capacity), shortExam.id, 1, studentB.id, '101']), /not accessible/);
      await fails(call(other, 'begin_submission', [org, id(200 + capacity), shortExam.id, 1, student.id, '101']), /Permission denied/);
    });
    await test(`classless exam validates student QR reference (${capacity})`, async () => {
      const ref = await call(teacher, 'create_sheet_reference', [shortExam.id, student.id, '102']);
      assert.equal((await call(teacher, 'validate_sheet_reference', [ref, shortExam.id, student.number, '102'])).student_number, student.number);
    });
    const shortDraft = await call(teacher, 'begin_submission', [org, id(300 + capacity), shortExam.id, 1, student.id, '102']);
    await as(teacher, () => db.query("insert into storage.objects(bucket_id,name) values('answer-sheets',$1),('answer-sheets',$2)", [shortDraft.original_path, shortDraft.processed_path]));
    const fullMarks = Array.from({ length: capacity }, (_, i) => ({ number: i + 1, selected: i < 10 ? ['B'] : ['A', 'B'], state: i < 10 ? 'marked' : 'review', confidence: 1, ratios: [0, 1, 0, 0] }));
    await test(`missing, duplicate and uncertain in-scope marks are rejected (${capacity})`, async () => {
      await fails(call(teacher, 'finalize_submission', [shortDraft.id, fullMarks.slice(1)]), /Answer count mismatch/);
      await fails(call(teacher, 'finalize_submission', [shortDraft.id, [...fullMarks, fullMarks[0]]]), /Answer count mismatch|Duplicate/);
      const uncertain = structuredClone(fullMarks); uncertain[0].state = 'review';
      await fails(call(teacher, 'finalize_submission', [shortDraft.id, uncertain]), /Review all/);
    });
    await test(`server grades only 10 questions, ignoring extra marks on ${capacity}-question sheet`, async () => {
      const saved = await call(teacher, 'finalize_submission', [shortDraft.id, fullMarks]);
      assert.equal(saved.score, 10); assert.equal(saved.answers.length, 10); assert.equal(saved.class_id, student.class_id);
    });
    await test(`server rejects exam questions beyond ${capacity}-question sheet capacity`, async () => {
      const tooLong = structuredClone(shortDocument);
      tooLong.answer_sheets.forEach(s => { s.sections[0].questions = Array.from({ length: capacity + 1 }, (_, i) => ({ number: i + 1, correct_answer: 'A', points: 10 / (capacity + 1) })); });
      await fails(call(teacher, 'save_exam', [org, { ...shortExam, version: 3, document: tooLong }, true]), /Template question count mismatch/);
    });
  }
  await test('class-bound exam still rejects a student from another class', () => fails(call(teacher, 'begin_submission', [org, id(400), exam.id, 1, studentB.id, '101']), /does not belong/));
  await test('viewer cannot create classless exams', () => fails(call(viewer, 'save_exam', [org, { ...exam, id: id(401), class_id: null }, false]), /Permission denied/));

  // Mixed keys and server grading must agree with the browser, including partial credit.
  const { createMixedTemplate } = await vite.ssrLoadModule('/src/domain/templates.ts');
  const { addMixedSections } = await vite.ssrLoadModule('/src/domain/mixed-answers.ts');
  const { grade } = await vite.ssrLoadModule('/src/domain/grading-engine.ts');
  const mixedTemplate = { ...createMixedTemplate(), id: id(500) };
  await call(admin, 'save_template', [org, { ...mixedTemplate, version: 1, questions: mixedTemplate.questions.slice(0,40) }]);
  await call(admin, 'save_template', [org, mixedTemplate]);
  const mixedDocument = addMixedSections(structuredClone(document));
  mixedDocument.answer_sheets.forEach(sheet => {
    sheet.sections[1].questions.forEach(q => { q.correct_answer = 'TFTF'; });
    ['-1.25','0','12.3','1234','-9999','0.5'].forEach((answer,i) => { sheet.sections[2].questions[i].correct_answer = answer; });
  });
  const mixedExam = { ...exam, id: id(501), template_id: mixedTemplate.id, template_version: 2, document: mixedDocument };
  await test('teacher saves three-part exam with four-item true-false and numeric keys', async () => {
    await call(teacher, 'save_exam', [org, mixedExam, false]);
    const saved = (await call(teacher,'get_workspace',[org])).exams.find(e => e.id === mixedExam.id);
    assert.deepEqual(saved.document,mixedDocument);
  });
  await test('server rejects mixed sections on the immutable MCQ-only template version', () => fails(call(teacher,'save_exam',[org,{...mixedExam,id:id(502),template_version:1},false]), /Template/));
  await test('server rejects malformed mixed keys and scoring metadata', async () => {
    for (const change of [
      d => { d.answer_sheets[0].sections[1].questions[0].correct_answer='ABCD'; },
      d => { d.answer_sheets[0].sections[2].questions[0].correct_answer='12345'; },
      d => { d.answer_sheets[0].sections[1].scoring='forged'; },
      d => { d.answer_sheets[0].sections[1].questions[0].number=40; },
      d => { d.answer_sheets[0].sections[2].questions[0].injected=true; },
    ]) {
      const invalid=structuredClone(mixedDocument); change(invalid);
      await fails(call(teacher,'save_exam',[org,{...mixedExam,version:2,document:invalid},true]),/Invalid|Unsupported|Mixed|Unknown/);
    }
  });
  await test('server validates true-false and digit geometry before saving a template version', async () => {
    const invalid=structuredClone(mixedTemplate); invalid.version=3; invalid.questions[48].short_answer.columns[0][1].label='0';
    await fails(call(admin,'save_template',[org,invalid]),/Invalid short-answer digit/);
  });
  const mixedMarks=mixedDocument.answer_sheets[0].sections.flatMap(section => section.questions.map(q => ({number:q.number,selected:[q.correct_answer],state:'marked',confidence:1,ratios:[],reviewed:true})));
  ['FTFT','TTFT','TFFT','TFTT'].forEach((answer,i) => { mixedMarks.find(m => m.number===41+i).selected=[answer]; });
  mixedMarks.find(m=>m.number===49).selected=['-1,25'];
  mixedMarks.find(m=>m.number===50).selected=['-0.00'];
  const mixedDraft=await call(teacher,'begin_submission',[org,id(503),mixedExam.id,1,student.id,'101']);
  await as(teacher,()=>db.query("insert into storage.objects(bucket_id,name) values('answer-sheets',$1),('answer-sheets',$2)",[mixedDraft.original_path,mixedDraft.processed_path]));
  await test('server refuses unresolved or malformed mixed recognition',async()=>{
    for (const [number,value,state] of [[41,'TF?F','marked'],[49,'1e2','marked'],[49,'1.25','review']]) {
      const bad=structuredClone(mixedMarks); const row=bad.find(m=>m.number===number); row.selected=[value]; row.state=state;
      await fails(call(teacher,'finalize_submission',[mixedDraft.id,bad]),/Invalid|Review all/);
    }
  });
  await test('server grades three parts with partial credit and numeric normalization, ignoring forged earned points',async()=>{
    const forged=mixedMarks.map(m=>({...m,earned:100,status:'correct',points:100}));
    const saved=await call(teacher,'finalize_submission',[mixedDraft.id,forged]), expected=grade(mixedDocument,'101',mixedMarks);
    assert.equal(saved.score,expected.score);
    assert.deepEqual(saved.answers.map(a=>[a.number,a.status,a.earned]),expected.answers.map(a=>[a.number,a.status,a.earned]));
    assert.ok(saved.answers.some(a=>a.status==='partial'));
  });
  await test('regrading mixed answers keeps history and applies the new true-false weighting',async()=>{
    const changed=structuredClone(mixedExam); changed.version=2;
    changed.document.answer_sheets.forEach(sheet=>{sheet.sections[1].scoring='per_item';});
    await call(teacher,'save_exam',[org,changed,true]);
    await call(teacher,'regrade_submission',[mixedDraft.id,org,2,1,'Updated mixed scoring rule']);
    const saved=(await call(teacher,'get_workspace',[org])).submissions.find(s=>s.id===mixedDraft.id);
    assert.equal(saved.score,grade(changed.document,'101',mixedMarks).score);
    assert.equal(saved.history.length,2);
    assert.equal(saved.history[0].score,grade(mixedDocument,'101',mixedMarks).score);
  });
  await test('mixed grading helpers remain inaccessible to browser clients',()=>fails(as(teacher,()=>db.query("select public.valid_short_answer('1')")),/permission denied/i));

  await test('new print-layout versions save without changing historical OMR geometry', async () => {
    const { createLargePrintTemplate } = await vite.ssrLoadModule('/src/domain/large-print-sheet.ts');
    for (const old of [template, mixedTemplate]) {
      const enlarged = createLargePrintTemplate(old);
      await call(admin, 'save_template', [org, enlarged]);
      const templates = (await call(admin, 'get_workspace', [org])).templates;
      assert.deepEqual(templates.find(t => t.id === old.id && t.version === old.version).anchors, old.anchors);
      const saved = templates.find(t => t.id === old.id && t.version === enlarged.version);
      assert.equal(saved.print_layout, 'a4-25mm'); assert.deepEqual(saved.student_region, enlarged.student_region);
      await fails(call(admin, 'save_template', [org, { ...enlarged, version: enlarged.version + 1, print_layout: 'unknown' }]), /Unsupported print layout/);
      await fails(call(admin, 'save_template', [org, { ...enlarged, version: enlarged.version + 1, unexpected: true }]), /Invalid template/);
    }
  });

  console.log(`\n${count} PostgreSQL/RLS integration checks passed.`);
} catch (error) { console.error('DB CHECK FAILED:', error.message, error.detail ?? '', 'position', error.position ?? '', 'internal', error.internalPosition ?? '', error.where ?? ''); process.exitCode = 1; } finally { await vite.close(); await db.close(); }
