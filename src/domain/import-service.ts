import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { answerDocumentSchema, type AnswerDocument } from './schemas';

export type RawRow = Record<string, unknown>;
export type ColumnMap = { code: string; number: string; answer: string; points: string };
export interface RowIssue { row: number; message: string }
export interface AnswerTable { headers: string[]; rows: string[][] }
export type AnswerTableLayout = 'matrix' | 'rows';

function answerTable(cells: unknown[][]): AnswerTable {
  const text = cells.map(row => row.map(cell => String(cell ?? '').trim()));
  const width = text.reduce((max, row) => Math.max(max, row.reduce((last, cell, index) => cell ? index + 1 : last, 0)), 0);
  const pad = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] ?? '');
  return { headers: pad(text[0] ?? []), rows: text.slice(1).map(pad) };
}
export function parseAnswerCSV(text: string): AnswerTable {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(result.errors.map(e => `Dòng ${(e.row ?? 0) + 1}: ${e.message}`).join('\n'));
  return answerTable(result.data);
}
export async function readAnswerTable(file: File): Promise<AnswerTable> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Tệp đáp án tối đa 10 MB');
  if (/\.csv$/i.test(file.name)) return parseAnswerCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận CSV UTF-8 hoặc XLSX');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
  if (!book.SheetNames.length) throw new Error('Tệp Excel không có trang tính');
  // Keep column positions, duplicate headers, and formatted codes such as 001.
  return answerTable(XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: true }));
}
export function detectAnswerTableLayout(table: AnswerTable): AnswerTableLayout {
  const headers = table.headers.map(h => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, ''));
  return headers.some(h => ['examcode', 'correctanswer', 'points', 'dapan', 'diem'].includes(h)) ? 'rows' : 'matrix';
}
export function answerTableRows(table: AnswerTable): RawRow[] {
  return table.rows.filter(row => row.some(cell => cell.trim())).map(row => Object.fromEntries(table.headers.map((header, i) => [header, row[i] ?? ''])));
}
export function mapAnswerMatrix(table: AnswerTable, exam: AnswerDocument['exam']) {
  const errors: RowIssue[] = [], codes = table.headers.slice(1).map(code => code.trim()), seenCodes = new Set<string>(), seenNumbers = new Set<number>();
  if (!codes.length) errors.push({ row: 1, message: 'Hàng đầu cần có mã đề từ cột thứ hai; cột đầu là số câu' });
  codes.forEach((code, i) => {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) errors.push({ row: 1, message: `Cột ${i + 2}: mã đề không hợp lệ hoặc để trống` });
    if (seenCodes.has(code)) errors.push({ row: 1, message: `Trùng mã đề ${code}` });
    seenCodes.add(code);
  });
  const rows = table.rows.map((cells, i) => ({ cells, row: i + 2 })).filter(({ cells }) => cells.some(cell => String(cell ?? '').trim()));
  if (!rows.length) errors.push({ row: 0, message: 'Chưa có câu hỏi trong bảng đáp án' });
  const sheets = codes.map(exam_code => ({ exam_code, sections: [{ type: 'mcq' as const, title: 'Trắc nghiệm', choices: 4, questions: [] as AnswerDocument['answer_sheets'][number]['sections'][number]['questions'] }] }));
  rows.forEach(({ cells, row }) => {
    const rawNumber = String(cells[0] ?? '').trim(), number = Number(rawNumber);
    if (!rawNumber || !Number.isInteger(number) || number < 1 || number > 500) errors.push({ row, message: 'Cột đầu phải là số câu nguyên từ 1 đến 500' });
    else if (seenNumbers.has(number)) errors.push({ row, message: `Trùng câu ${number}` });
    seenNumbers.add(number);
    codes.forEach((code, column) => {
      const answer = String(cells[column + 1] ?? '').trim().toUpperCase();
      if (!/^[A-D]$/.test(answer)) errors.push({ row, message: `Mã đề ${code}, câu ${rawNumber || '?'}: đáp án phải là A–D, không được để trống` });
      sheets[column].sections[0].questions.push({ number, correct_answer: answer as 'A', points: exam.grading_scale / rows.length });
    });
    if (cells.slice(table.headers.length).some(cell => String(cell ?? '').trim())) errors.push({ row, message: 'Có đáp án ở cột chưa khai báo mã đề' });
  });
  if (errors.length) return { errors, document: null };
  sheets.forEach(sheet => sheet.sections[0].questions.sort((a, b) => a.number - b.number));
  const result = answerDocumentSchema.safeParse({ schema_version: '1.0', exam, answer_sheets: sheets });
  if (!result.success) return { errors: result.error.issues.map(issue => ({ row: 0, message: issue.message })), document: null };
  return { errors, document: result.data };
}
export function parseCSV(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() });
  if (result.errors.length) throw new Error(result.errors.map(e => `Dòng ${(e.row ?? 0) + 2}: ${e.message}`).join('\n'));
  return result.data;
}
export async function readTable(file: File): Promise<RawRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Tệp đáp án tối đa 10 MB');
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận CSV UTF-8 hoặc XLSX');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
  return XLSX.utils.sheet_to_json<RawRow>(book.Sheets[book.SheetNames[0]], { defval: '' });
}
export function mapRows(rows: RawRow[], map: ColumnMap, exam: AnswerDocument['exam']) {
  const errors: RowIssue[] = [], seen = new Set<string>(), sheets = new Map<string, { number: number; correct_answer: 'A' | 'B' | 'C' | 'D' | 'E'; points: number }[]>();
  rows.forEach((r, i) => {
    const code = String(r[map.code] ?? '').trim(), rawNumber = String(r[map.number] ?? '').trim(), rawPoints = String(r[map.points] ?? '').trim().replace(',', '.'), number = Number(rawNumber), answer = String(r[map.answer] ?? '').trim().toUpperCase(), points = Number(rawPoints);
    const messages: string[] = [];
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) messages.push('Mã đề không hợp lệ');
    if (!rawNumber || !Number.isInteger(number) || number < 1 || number > 500) messages.push('Số câu không hợp lệ');
    if (!/^[A-D]$/.test(answer)) messages.push('Đáp án phải là A–D (JSON hỗ trợ phần có 2–5 lựa chọn)');
    if (!rawPoints || !(points > 0) || points > 100) messages.push('Điểm phải lớn hơn 0');
    const identity = `${code}:${number}`;
    if (seen.has(identity)) messages.push('Trùng câu trong cùng mã đề');
    seen.add(identity);
    if (messages.length) { errors.push({ row: i + 2, message: messages.join('; ') }); return; }
    sheets.set(code, [...(sheets.get(code) ?? []), { number, correct_answer: answer as 'A', points }]);
  });
  if (errors.length) return { errors, document: null };
  const result = answerDocumentSchema.safeParse({ schema_version: '1.0', exam, answer_sheets: [...sheets].map(([exam_code, questions]) => ({ exam_code, sections: [{ type: 'mcq', title: 'Trắc nghiệm', choices: 4, questions: questions.sort((a, b) => a.number - b.number) }] })) });
  if (!result.success) return { errors: result.error.issues.map(issue => ({ row: 0, message: issue.message })), document: null };
  return { document: result.data, errors };
}
export function parseJSON(text: string) { return answerDocumentSchema.parse(JSON.parse(text)); }
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJSON(value: unknown, name: string) { downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), name); }
function safeCell(value: unknown) { return typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value; }
export function answerMatrixCells(document: AnswerDocument): string[][] {
  const keys = document.answer_sheets.map(sheet => new Map(sheet.sections.flatMap(section => section.questions).map(q => [q.number, q.correct_answer])));
  const numbers = [...new Set(keys.flatMap(key => [...key.keys()]))].sort((a, b) => a - b);
  return [['Câu', ...document.answer_sheets.map(sheet => sheet.exam_code)], ...numbers.map(number => [String(number), ...keys.map(key => key.get(number) ?? '')])];
}
export function exportAnswerMatrix(document: AnswerDocument, format: 'csv' | 'xlsx') {
  const cells = answerMatrixCells(document).map(row => row.map(safeCell));
  if (format === 'csv') downloadBlob(new Blob(['\uFEFF' + Papa.unparse(cells)], { type: 'text/csv;charset=utf-8' }), 'mau-dap-an.csv');
  else { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(cells), 'Đáp án'); XLSX.writeFile(book, 'mau-dap-an.xlsx'); }
}
export function exportTable(rows: RawRow[], name: string, format: 'csv' | 'xlsx') {
  const safe = rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safeCell(v)])));
  if (format === 'csv') downloadBlob(new Blob(['\uFEFF' + Papa.unparse(safe)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
  else { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(safe), 'Dữ liệu'); XLSX.writeFile(book, `${name}.xlsx`); }
}
