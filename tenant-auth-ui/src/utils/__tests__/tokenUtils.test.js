import { decodeToken } from '../tokenUtils';

// A JWT segment is base64URL-encoded UTF-8. atob() alone read it one byte per
// character (so "Mayini’s" came out as "Mayiniâ€™s" in the menu) and refused
// any segment containing '-' or '_' (so some tokens decoded to nothing).

const b64url = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenOf = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;

describe('decodeToken', () => {
  it('keeps a name outside plain ASCII intact', () => {
    expect(decodeToken(tokenOf({ name: 'Animesh Mayini’s', tid: 't1' })).name).toBe('Animesh Mayini’s');
    expect(decodeToken(tokenOf({ name: 'प्रिया', tid: 't1' })).name).toBe('प्रिया');
  });

  it('reads a segment that uses the base64url characters', () => {
    // Chosen so the encoding contains both '-' and '_'.
    const payload = { name: '>>>???', note: '~~~ÿÿ', tid: 't1' };
    const token = tokenOf(payload);
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(decodeToken(token)).toEqual(payload);
  });

  it('still refuses something that is not a token', () => {
    expect(decodeToken('not-a-token')).toBeNull();
    expect(decodeToken('')).toBeNull();
  });
});
