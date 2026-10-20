import { choices, type AnswerDocument } from '../domain/schemas';
import { questionLabel } from '../domain/answer-format';
import './mixed-answers.css';

type Section = AnswerDocument['answer_sheets'][number]['sections'][number];
export function AnswerSectionEditor({ section, mixed, change, remove }: { section: Section; mixed: boolean; change: (section: Section) => void; remove?: () => void }) {
  const update = (fn: (draft: Section) => void) => { const draft = structuredClone(section); fn(draft); change(draft); };
  const limit = section.type === 'true_false' ? 8 : section.type === 'short_answer' ? 6 : mixed ? 40 : 500;
  return <section className="section-editor">
    <div className="section-controls">
      <label>Tên phần<input value={section.title} onChange={e => update(s => { s.title = e.target.value; })}/></label>
      <label>Số câu<input type="number" min="1" max={limit} value={section.questions.length} onChange={e => update(s => {
        const count = Math.min(limit, Math.max(1, Number(e.target.value)));
        s.questions = Array.from({ length: count }, (_, i) => s.questions[i] ?? { number: i + 1, correct_answer: s.type === 'true_false' ? 'TTTT' : s.type === 'short_answer' ? '0' : 'A', points: s.questions[0]?.points ?? .5 });
      })}/></label>
      {section.type === 'mcq' && <label>Lựa chọn<select value={section.choices} onChange={e => update(s => { s.choices = Number(e.target.value); s.questions.forEach(q => { if (!choices.slice(0, s.choices).some(c => c === q.correct_answer)) q.correct_answer = 'A'; }); })}>{[2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>}
      <label>Điểm mỗi câu<input type="number" min="0.001" step="0.001" value={section.questions[0].points} onChange={e => update(s => { s.questions.forEach(q => { q.points = Number(e.target.value); }); })}/></label>
      {section.type === 'true_false' && <label>Cách tính điểm<select value={section.scoring ?? 'partial'} onChange={e => update(s => { s.scoring = e.target.value as 'partial' | 'per_item'; })}><option value="partial">1/2/3/4 ý đúng: 10%/25%/50%/100%</option><option value="per_item">Chia đều điểm cho bốn ý</option></select></label>}
      {remove && <button className="text-button danger" onClick={remove}>Xóa phần</button>}
    </div>
    {section.type === 'true_false' && <p className="helper">Điểm mỗi câu là điểm tối đa cho cả bốn ý a–d. Ý bỏ trống không được tính là đúng.</p>}
    {section.type === 'short_answer' && <p className="helper">Nhập tối đa bốn chữ số, có thể kèm dấu âm và dấu thập phân. Ví dụ: −1,25 nhập -1,25. Khi tô, các chữ số phải liên tiếp.</p>}
    <div className={section.type === 'true_false' ? 'tf-answer-grid' : section.type === 'short_answer' ? 'answer-grid numeric-answer-grid' : 'answer-grid'}>
      {section.questions.map((q, qi) => {
        const label = questionLabel(q.number, section.type);
        const setAnswer = (answer: string) => update(s => { s.questions[qi].correct_answer = answer; });
        return section.type === 'true_false' ? <div className="tf-answer-cell" key={q.number}><strong>Câu {label}</strong>{['a', 'b', 'c', 'd'].map((item, index) => <label key={item}>{item}<select aria-label={`Đáp án ${label} ${item}`} value={q.correct_answer[index] ?? 'T'} onChange={e => { const answer = [...q.correct_answer]; answer[index] = e.target.value; setAnswer(answer.join('')); }}><option value="T">Đúng</option><option value="F">Sai</option></select></label>)}</div> : <label key={q.number} className="answer-cell"><span>{label}</span>
          {section.type === 'short_answer' ? <input aria-label={`Đáp án ${label}`} inputMode="decimal" maxLength={7} value={q.correct_answer} onChange={e => setAnswer(e.target.value)}/> : <select aria-label={`Đáp án câu ${q.number}`} value={q.correct_answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => {
            const key = e.key.toUpperCase(); if (choices.slice(0, section.choices).some(c => c === key)) { e.preventDefault(); setAnswer(key); const selects = [...e.currentTarget.closest('.answer-grid')!.querySelectorAll('select')]; (selects[qi + 1] as HTMLSelectElement | undefined)?.focus(); }
          }}>{choices.slice(0, section.choices).map(c => <option key={c}>{c}</option>)}</select>}
        </label>;
      })}
    </div>
  </section>;
}
