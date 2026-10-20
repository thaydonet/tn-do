import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { answerMatrixCells, answerTableRows, detectAnswerTableLayout, mapAnswerMatrix, mapRows, parseAnswerCSV, readAnswerTable } from '../src/domain/import-service';

const exam = { title: 'Kiểm tra thường xuyên', subject: 'Toán', grading_scale: 10 };
const codes = ['984', '605', '900', '134'];
const cells = [['Câumã đề', ...codes], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), ...codes.map((_, j) => 'ABCD'[(i + j) % 4])])];
const csv = cells.map(row => row.join(',')).join('\n');
function workbookFile(rows: (string | number)[][]) {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, sheet, 'DapAn');
  return { sheet, file: () => new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'dap-an.xlsx') };
}

describe('Answer matrices with codes across the first row', () => {
  it('imports the 4-code, 10-question layout and keeps the original column order', () => {
    const table = parseAnswerCSV('\uFEFF' + csv);
    expect(detectAnswerTableLayout(table)).toBe('matrix');
    const result = mapAnswerMatrix(table, exam);
    expect(result.errors).toEqual([]);
    expect(result.document?.answer_sheets.map(sheet => sheet.exam_code)).toEqual(codes);
    result.document?.answer_sheets.forEach((sheet, column) => {
      expect(sheet.sections[0].questions.map(q => q.correct_answer)).toEqual(cells.slice(1).map(row => row[column + 1]));
      expect(sheet.sections[0].questions.map(q => q.points)).toEqual(Array(10).fill(1));
    });
  });
  it('reads real XLSX bytes, including zero-padded numeric headers and a blank corner', async () => {
    const book = workbookFile([['', 1, '002'], [1, 'a', ' B '], [2, 'C', 'd']]);
    book.sheet.B1.z = '000';
    const table = await readAnswerTable(book.file());
    expect(table.headers).toEqual(['', '001', '002']);
    const result = mapAnswerMatrix(table, exam);
    expect(result.errors).toEqual([]);
    expect(result.document?.answer_sheets.map(s => s.exam_code)).toEqual(['001', '002']);
    expect(result.document?.answer_sheets[0].sections[0].questions.map(q => q.correct_answer)).toEqual(['A', 'C']);
    expect(result.document?.answer_sheets[1].sections[0].questions.map(q => q.points)).toEqual([5, 5]);
  });
  it('reads CSV files with semicolons and preserves leading zeros', async () => {
    const table = await readAnswerTable(new File([';001;002\n1;A;B\n2;C;D'], 'dap-an.csv'));
    expect(table.headers).toEqual(['', '001', '002']);
    expect(mapAnswerMatrix(table, exam).errors).toEqual([]);
  });
  it('reports duplicate code headers instead of silently renaming them', async () => {
    const table = await readAnswerTable(workbookFile([['Câu', '101', '101'], [1, 'A', 'B']]).file());
    expect(mapAnswerMatrix(table, exam).errors).toContainEqual({ row: 1, message: 'Trùng mã đề 101' });
  });
  it('reports an empty header with answers underneath', () => {
    const result = mapAnswerMatrix(parseAnswerCSV('Câu,101,\n1,A,B'), exam);
    expect(result.document).toBeNull(); expect(result.errors[0]).toMatchObject({ row: 1 });
  });
  it('identifies the code, question, and file row for missing or invalid answers', () => {
    const result = mapAnswerMatrix(parseAnswerCSV('Câu,101,102\n1,A,B\n2,,Z'), exam);
    expect(result.document).toBeNull();
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ row: 3, message: expect.stringContaining('Mã đề 101, câu 2') });
    expect(result.errors[1].message).toContain('Mã đề 102, câu 2');
  });
  it.each(['Câu,101\n1,A\n1,B', 'Câu,101\n1,A\n3,B', 'Câu,101\n,A'])('rejects duplicate, non-contiguous or missing question numbers', source => {
    expect(mapAnswerMatrix(parseAnswerCSV(source), exam).document).toBeNull();
  });
  it('ignores entirely blank rows and columns while keeping numeric question order', () => {
    const table = parseAnswerCSV('Câu,101,\n2,B,\n,,\n1,A,');
    expect(table.headers).toEqual(['Câu', '101']);
    expect(mapAnswerMatrix(table, exam).document?.answer_sheets[0].sections[0].questions.map(q => q.number)).toEqual([1, 2]);
  });
  it('distributes the selected scale equally even when division repeats', () => {
    const result = mapAnswerMatrix(parseAnswerCSV('Câu,101\n1,A\n2,B\n3,C'), { ...exam, grading_scale: 7 });
    expect(result.errors).toEqual([]);
    expect(result.document?.answer_sheets[0].sections[0].questions.reduce((total, q) => total + q.points, 0)).toBeCloseTo(7);
  });
  it('exports headers in code order and round-trips the matrix', () => {
    const original = mapAnswerMatrix(parseAnswerCSV(csv), exam).document!;
    const exported = answerMatrixCells(original);
    expect(exported[0]).toEqual(['Câu', ...codes]);
    const imported = mapAnswerMatrix(parseAnswerCSV(exported.map(row => row.join(',')).join('\n')), exam);
    expect(imported.document).toEqual(original);
  });
  it('keeps the existing row format and its per-question points', async () => {
    const table = await readAnswerTable(new File(['exam_code,number,correct_answer,points\n001,1,A,3\n001,2,B,7'], 'old.csv'));
    expect(detectAnswerTableLayout(table)).toBe('rows');
    const result = mapRows(answerTableRows(table), { code: 'exam_code', number: 'number', answer: 'correct_answer', points: 'points' }, exam);
    expect(result.document?.answer_sheets[0].sections[0].questions.map(q => q.points)).toEqual([3, 7]);
  });
});
