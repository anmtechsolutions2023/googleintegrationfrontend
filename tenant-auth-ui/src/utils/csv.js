// src/utils/csv.js
//
// A CSV parser, written here rather than pulled in as a dependency.
//
// The file is parsed in the BROWSER and posted as JSON, so the backend needs no
// upload endpoint, no multipart handling and no parser of its own — and, more
// importantly, the person sees the parse before anything is sent. "Row 41 is
// malformed" in a preview table is a different experience from discovering it
// after the write.
//
// The rules that actually bite, all of which appear in real spreadsheet
// exports: a field may be quoted; a quoted field may contain commas and
// newlines; a doubled quote inside a quoted field is one literal quote; lines
// may end CRLF; and Excel writes a byte-order mark at the front of the file.

const BOM = '﻿';

/**
 * Split CSV text into rows of raw string cells.
 *
 * Character by character rather than by splitting on commas, because a comma
 * inside a quoted field is data — splitting first is the bug every hand-rolled
 * parser ships with.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^﻿/, '').replace(new RegExp(BOM, 'g'), '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;                        // CRLF — the \n does the work
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }

  // Whatever is left when the text runs out. Guarded so a trailing newline does
  // not produce a phantom empty row.
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

/**
 * Parse CSV into objects keyed by the header row.
 *
 * Headers are lower-cased and stripped of spaces and underscores, so
 * `Tax Group`, `tax_group` and `taxgroup` are the same column — a spreadsheet
 * export should not have to be perfect to be accepted.
 *
 * @param {string} text
 * @returns {{headers: string[], rows: Object[], errors: string[]}}
 */
export const parseCsvToObjects = (text) => {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [], errors: ['The file is empty'] };

  const raw = grid[0].map((h) => String(h).trim());
  const keys = raw.map((h) => h.toLowerCase().replace(/[\s_-]/g, ''));
  const errors = [];

  const rows = grid.slice(1).map((cells, i) => {
    const obj = { __line: i + 2 };   // +2: one for the header, one for 1-based
    keys.forEach((key, c) => { obj[key] = (cells[c] ?? '').trim(); });
    // A row with more cells than headers usually means an unquoted comma, which
    // silently shifts every column after it. Worth saying, not swallowing.
    if (cells.length > keys.length) {
      errors.push(`Row ${i + 2} has more values than there are columns — check for an unquoted comma`);
    }
    return obj;
  });

  return { headers: raw, rows, errors };
};

/**
 * Serialise rows back to CSV — used for the template and for failed rows, so
 * somebody can fix and re-run rather than hunting through a file.
 *
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @returns {string}
 */
export const toCsv = (headers, rows) => {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
};

export default { parseCsv, parseCsvToObjects, toCsv };
