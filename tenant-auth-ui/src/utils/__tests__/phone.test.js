// src/utils/__tests__/phone.test.js
//
// The identity is a phone number, so how one is written down is not cosmetic: the
// same person must look like the same person in a list, a header and an audit row.

import { personLabel, hasRealName, formatForDisplay, digitsOnly } from '../phone';

// Sanity: the two helpers these tests lean on behave as the rest of the app expects.
describe('writing a number down', () => {
  it('groups an E.164 number the way people read it aloud', () => {
    expect(formatForDisplay('+919876543210')).toBe('+91 98765 43210');
  });

  it('leaves anything that is not a +91 number untouched rather than grouping it wrongly', () => {
    expect(formatForDisplay('not a number')).toBe('not a number');
  });

  it('strips a country code or trunk zero before taking ten digits', () => {
    expect(digitsOnly('+919876543210')).toBe('9876543210');
    expect(digitsOnly('09876543210')).toBe('9876543210');
  });
});

// ── A "name" that is really just the number ──────────────────────────────────
//
// user_tenants.full_name is NOT NULL and an OTP sign-in never asks for a name, so
// provisioning falls back to `fullName || phone` and stores the number AS the
// name. That fallback is fine — a number is a poor label, not a broken one. The
// mistake was printing that poor label as a name BESIDE the number it came from,
// which put "Welcome, +919876543210 · +91 98765 43210" on the dashboard.
describe('a person whose name is their number', () => {
  it('is labelled with the number once, formatted', () => {
    expect(personLabel({ name: '+919876543210', phone: '+919876543210' }))
      .toBe('+91 98765 43210');
  });

  it('is not treated as having a real name', () => {
    expect(hasRealName({ name: '+919876543210', phone: '+919876543210' })).toBe(false);
  });

  // Compared on digits: the stored name and the identity are both E.164, but a
  // stray space or a missing country code must not make them look different.
  it('sees through a different spelling of the same number', () => {
    expect(hasRealName({ name: '9876543210', phone: '+919876543210' })).toBe(false);
    expect(hasRealName({ name: '+91 98765 43210', phone: '+919876543210' })).toBe(false);
  });

  it('still prefers a genuine name, and says so', () => {
    expect(personLabel({ name: 'Priya Raman', phone: '+919876543210' })).toBe('Priya Raman');
    expect(hasRealName({ name: 'Priya Raman', phone: '+919876543210' })).toBe(true);
  });

  // A name that merely CONTAINS digits is still a name.
  it('does not mistake a name with a number in it for the number', () => {
    expect(hasRealName({ name: 'Counter 2', phone: '+919876543210' })).toBe(true);
  });

  it('falls back to the number when there is no name at all', () => {
    expect(personLabel({ phone: '+919876543210' })).toBe('+91 98765 43210');
    expect(hasRealName({ phone: '+919876543210' })).toBe(false);
  });

  it('reads the other spellings of the same two fields', () => {
    expect(personLabel({ full_name: 'Ravi K', user_phone: '+919876543210' })).toBe('Ravi K');
    expect(personLabel({ fullName: 'Ravi K', phone: '+919876543210' })).toBe('Ravi K');
  });

  it('has something to say about nobody at all', () => {
    expect(personLabel({})).toBe('—');
  });
});
