import { parseCsv, parseCsvToObjects, toCsv } from '../csv';

// Everything downstream trusts this, so it is tested on its own before anything
// is built on top of it. Every case here is one a real spreadsheet export
// produces — none of them are hypothetical.

describe('parsing', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  // The bug every hand-rolled parser ships with: splitting on commas first.
  it('keeps a comma that is inside quotes', () => {
    expect(parseCsv('name,note\n"Lassi, Mango",cold'))
      .toEqual([['name', 'note'], ['Lassi, Mango', 'cold']]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('name\n"He said ""hi"""')).toEqual([['name'], ['He said "hi"']]);
  });

  it('keeps a newline that is inside quotes', () => {
    expect(parseCsv('name,desc\n"Tea","hot\nand sweet"'))
      .toEqual([['name', 'desc'], ['Tea', 'hot\nand sweet']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  // Excel writes one at the front of the file; without stripping it the first
  // header becomes "﻿name" and never matches.
  it('strips the byte-order mark Excel adds', () => {
    const { headers } = parseCsvToObjects('﻿name,price\nTea,20');
    expect(headers[0]).toBe('name');
  });

  it('ignores a trailing newline rather than inventing a row', () => {
    expect(parseCsv('a\n1\n')).toHaveLength(2);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a\n1\n\n\n2')).toEqual([['a'], ['1'], ['2']]);
  });

  it('says so when the file is empty', () => {
    expect(parseCsvToObjects('').errors[0]).toMatch(/empty/i);
  });
});

describe('mapping to objects', () => {
  // A spreadsheet export should not have to be perfect to be accepted.
  it('matches headers however they are spelled', () => {
    const { rows } = parseCsvToObjects('Tax Group,tax_included,NAME\nGST 5%,true,Tea');
    expect(rows[0].taxgroup).toBe('GST 5%');
    expect(rows[0].taxincluded).toBe('true');
    expect(rows[0].name).toBe('Tea');
  });

  it('numbers rows the way the file does, counting the header', () => {
    const { rows } = parseCsvToObjects('name\nA\nB');
    expect(rows.map((r) => r.__line)).toEqual([2, 3]);
  });

  it('trims surrounding whitespace', () => {
    const { rows } = parseCsvToObjects('name , price\n  Tea  , 20 ');
    expect(rows[0].name).toBe('Tea');
    expect(rows[0].price).toBe('20');
  });

  // An unquoted comma shifts every column after it, silently.
  it('flags a row with more values than columns', () => {
    const { errors } = parseCsvToObjects('name,price\nLassi, Mango,80');
    expect(errors[0]).toMatch(/more values than there are columns/i);
  });

  it('leaves a missing trailing column blank rather than undefined', () => {
    const { rows } = parseCsvToObjects('name,price,code\nTea,20');
    expect(rows[0].code).toBe('');
  });
});

describe('writing', () => {
  it('round-trips a value that needs quoting', () => {
    const csv = toCsv(['name'], [['Lassi, Mango']]);
    expect(csv).toBe('name\n"Lassi, Mango"');
    expect(parseCsv(csv)[1][0]).toBe('Lassi, Mango');
  });

  it('escapes an embedded quote', () => {
    expect(parseCsv(toCsv(['a'], [['say "hi"']]))[1][0]).toBe('say "hi"');
  });

  it('writes an empty cell for null or undefined', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\n,');
  });
});
