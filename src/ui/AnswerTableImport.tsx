import { useState } from 'react';
import { FileUp } from 'lucide-react';
import type { AnswerDocument } from '../domain/schemas';
import { answerTableRows, detectAnswerTableLayout, exportAnswerMatrix, mapAnswerMatrix, mapRows, readAnswerTable, type AnswerTable, type AnswerTableLayout, type ColumnMap } from '../domain/import-service';
import { useTask } from './context';

export function AnswerTableImport({ document, onApply }: { document: AnswerDocument; onApply: (value: AnswerDocument) => void }) {
  const { run, busy } = useTask();
  const [table, setTable] = useState<AnswerTable | null>(null), [layout, setLayout] = useState<AnswerTableLayout>('matrix');
  const [map, setMap] = useState<ColumnMap>({ code: 'exam_code', number: 'number', answer: 'correct_answer', points: 'points' });
  const mapping = table ? layout === 'matrix' ? mapAnswerMatrix(table, document.exam) : mapRows(answerTableRows(table), map, document.exam) : null;
  const rowCount = table?.rows.filter(row => row.some(cell => cell.trim())).length ?? 0;
  return <>
    <div className="actions">
      <label className="button secondary"><FileUp size={16}/>Chọn CSV / XLSX<input type="file" hidden accept=".csv,.xlsx" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (file) void run(async () => { setTable(null); const loaded = await readAnswerTable(file); setLayout(detectAnswerTableLayout(loaded)); setTable(loaded); });
      }}/></label>
      <button className="text-button" onClick={() => exportAnswerMatrix(document, 'xlsx')}>Tải tệp mẫu XLSX</button>
      <button className="text-button" onClick={() => exportAnswerMatrix(document, 'csv')}>Tải CSV</button>
    </div>
    <p className="helper">Hàng đầu là mã đề; cột đầu là số câu. Ví dụ: Câu, 984, 605, 900, 134. Các ô còn lại chứa đáp án A–D.</p>
    {table && <>
      <label>Bố cục tệp<select value={layout} onChange={e => setLayout(e.target.value as AnswerTableLayout)}>
        <option value="matrix">Hàng đầu là mã đề, cột đầu là số câu</option>
        <option value="rows">Mỗi dòng là một câu của một mã đề</option>
      </select></label>
      {layout === 'matrix' ? <p className="helper">{Math.max(0, table.headers.length - 1)} mã đề · {rowCount} câu/mã đề. Điểm chia đều theo thang điểm {document.exam.grading_scale}{rowCount > 0 ? `: ${Number((document.exam.grading_scale / rowCount).toFixed(6)).toLocaleString('vi-VN')} điểm/câu` : ''}. Có thể chỉnh điểm sau khi áp dụng.</p> : <>
        <div className="form-grid">{(['code', 'number', 'answer', 'points'] as const).map((field, i) => <label key={field}>{['Mã đề', 'Số câu', 'Đáp án', 'Điểm'][i]}<select value={map[field]} onChange={e => setMap({ ...map, [field]: e.target.value })}><option value="">Chọn cột</option>{table.headers.map((header, column) => <option key={column}>{header}</option>)}</select></label>)}</div>
        <p className="helper">{rowCount} dòng · Chọn các cột mã đề, số câu, đáp án A–D và điểm. Dùng JSON để nhập cấu trúc mở rộng.</p>
      </>}
      <div className="table-scroll preview-table"><table><thead><tr>{table.headers.map((header, i) => <th key={i}>{header || (i === 0 && layout === 'matrix' ? 'Câu' : `Cột ${i + 1}`)}</th>)}</tr></thead><tbody>{table.rows.slice(0, 10).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
      {mapping?.errors.map((error, i) => <p className="inline-error" key={i}>{error.row ? `Dòng ${error.row}: ` : ''}{error.message}</p>)}
      <button className="button primary" disabled={busy || !mapping?.document} onClick={() => {
        if (mapping?.document && window.confirm(`Áp dụng đáp án ${mapping.document.answer_sheets.length} mã đề vào bản nháp?`)) onApply(mapping.document);
      }}>Xác nhận áp dụng dữ liệu</button>
    </>}
  </>;
}
