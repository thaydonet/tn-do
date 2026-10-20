import type { Recognition, TemplateQuestion } from '../domain/schemas';
import { questionLabel } from '../domain/answer-format';
import './mixed-answers.css';

export function RecognitionAnswerEditor({ question: q, mark: m, change }: { question: TemplateQuestion; mark: Recognition; change: (selected: string[]) => void }) {
  const label = questionLabel(q.number, q.section);
  if (q.section === 'true_false') return <div className="tf-review-options">{['a', 'b', 'c', 'd'].map((item, i) => <label key={item}>{item}<select aria-label={`Câu ${label} ${item}`} value={m.selected[0]?.[i] ?? '_'} onChange={e => { const values = [...(m.selected[0] ?? '____')]; values[i] = e.target.value; const text = values.join(''); change(text === '____' ? [] : [text]); }}><option value="_">—</option><option value="T">Đúng</option><option value="F">Sai</option></select></label>)}</div>;
  if (q.section === 'short_answer') return <div className="numeric-review"><input aria-label={`Câu ${label}`} inputMode="decimal" maxLength={7} value={m.selected[0] ?? ''} placeholder="Bỏ trống" onChange={e => change(e.target.value.trim() ? [e.target.value] : [])}/></div>;
  return <div className="bubble-options">{q.bubbles.map(b => <button key={b.label} className={m.selected.includes(b.label) ? 'chosen' : ''} aria-label={`Câu ${m.number}, ${b.label}`} aria-pressed={m.selected.includes(b.label)} onClick={() => change(m.selected.includes(b.label) ? m.selected.filter(x => x !== b.label) : [b.label])}>{b.label}</button>)}</div>;
}
