export function parseMark(value) {
  if (value === '' || value === null || value === undefined) return null;
  const text = String(value);
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text) || Number(text) > 100) {
    throw new Error('Enter marks from 0 to 100, with up to two decimal places.');
  }
  return Number(text);
}
export function calculate(marks) {
  const values = ['test_1', 'test_2', 'final_exam'].map(key => parseMark(marks[key]));
  if (values.some(value => value === null)) return null;
  const cents = values.map(value => Math.round(value * 100));
  return Math.round((cents[0] * 20 + cents[1] * 30 + cents[2] * 50) / 100) / 100;
}
export function letterGrade(total) {
  if (total === null || total === undefined) return null;
  return total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 40 ? 'D' : 'E';
}
export const formatMark = value => value === null || value === undefined ? '—' : Number(value).toFixed(2);
export const matchesSearch = (value, query) => query.toLocaleLowerCase().trim().split(/\s+/).every(token => value.toLocaleLowerCase().includes(token));
