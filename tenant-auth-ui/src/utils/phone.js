// src/utils/phone.js
// Displaying and typing a mobile number.
//
// The browser NEVER decides what a number canonically is — the server does,
// with src/utils/phone.js there, and its answer is what reaches the database.
// This file exists for two much smaller jobs: showing a number so a person can
// read it, and keeping the input field pleasant while they type.
//
// Deliberately not a second normaliser. Two implementations of "what counts as
// the same number" is exactly how a client and a server end up disagreeing
// about who somebody is.

/** Indian mobile: ten digits, first one 6-9. */
const IN_MOBILE = /^[6-9]\d{9}$/;

/**
 * The ten national digits, whatever was typed or pasted.
 *
 * People paste whole numbers — from a contact card, a WhatsApp chat, a
 * spreadsheet — and those carry a country code or a trunk zero. Truncating
 * blindly turns '+91 98765 43210' into '91987 65432', a different number that
 * still looks plausible. So the prefixes come off before the slice.
 */
export const digitsOnly = (raw) => {
  let d = String(raw ?? '').replace(/\D/g, '');
  // Length first, then prefix: a genuine ten-digit number may itself open '91'.
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  else if (d.length === 14 && d.startsWith('0091')) d = d.slice(4);
  return d.slice(0, 10);
};

/** '9876543210' -> '98765 43210'. Grouped as people read them aloud. */
export const groupNational = (raw) => {
  const d = digitsOnly(raw);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
};

/** Enough to enable the button. The server still has the final say. */
export const looksComplete = (raw) => IN_MOBILE.test(digitsOnly(raw));

/** What we send: E.164, so the wire format matches the stored format. */
export const toE164 = (raw, dialCode = '+91') => `${dialCode}${digitsOnly(raw)}`;

/**
 * '+919876543210' -> '+91 98765 43210'.
 * Anything that is not a 13-character +91 number is returned untouched rather
 * than grouped wrongly.
 */
export const formatForDisplay = (e164) => {
  const s = String(e164 ?? '');
  if (!/^\+91\d{10}$/.test(s)) return s;
  return `+91 ${s.slice(3, 8)} ${s.slice(8)}`;
};

/**
 * The label for a person.
 *
 * Name first, always. A bare '+919876543210' identifies nobody at a glance,
 * which an email address usually did — so every list, header and audit row goes
 * through here rather than printing the identity directly.
 */
/**
 * Is this "name" really just the number again?
 *
 * user_tenants.full_name is NOT NULL, and a person who signs up with an OTP is
 * never asked for one — the API accepts a name on verification but the sign-in
 * screen has never sent it, so provisioning falls back to `fullName || phone` and
 * stores the number as the name. The comment on that fallback calls a number "a
 * poor label, not a broken one", and it is right; the mistake is further down,
 * where a poor label then gets printed AS a name beside the number it came from.
 *
 * That is what put "Welcome, +919876543210 · +91 98765 43210" on the dashboard.
 *
 * Compared on digits, not on text: the stored name is E.164 and the identity it
 * came from is too, but a stray space or a missing +91 must not make them look
 * like different things.
 */
const isJustTheNumber = (name, phone) => {
  const n = digitsOnly(name);
  return n.length > 0 && n === digitsOnly(phone);
};

export const personLabel = (person = {}) => {
  const phone = person.phone || person.user_phone;
  const name = person.name || person.full_name || person.fullName;
  if (name && !isJustTheNumber(name, phone)) return name;
  // No real name: the formatted number, ONCE. Callers that also print the phone
  // ask hasRealName() first, so nobody sees it twice.
  return formatForDisplay(phone) || '—';
};

/**
 * Whether this person has a name worth printing beside their number.
 *
 * Exported because "show the name, then the number" is only right when the two
 * are different things — see personLabel.
 */
export const hasRealName = (person = {}) => {
  const name = person.name || person.full_name || person.fullName;
  return !!name && !isJustTheNumber(name, person.phone || person.user_phone);
};
