// src/utils/__tests__/phone.mobile.test.js
//
// ONE rule for "is this a usable mobile number", shared by the guest's phone at
// a QR table, the customer form and the till's quick-add. If these drift, a
// number one screen accepts is refused by another — or saved in two forms and
// turns one customer into two.

import { mobileError, toE164 } from '../phone'

describe('mobileError', () => {
  it('accepts a 10-digit Indian mobile however it is typed or pasted', () => {
    expect(mobileError('9876543210')).toBeNull()
    expect(mobileError('98765 43210')).toBeNull()
    expect(mobileError('+91 98765 43210')).toBeNull()
    expect(mobileError('09876543210')).toBeNull()
  })

  it('refuses a number that cannot be an Indian mobile, and says why', () => {
    expect(mobileError('12345')).toMatch(/start with 6, 7, 8 or 9/)
  })

  it('counts down the digits still needed', () => {
    expect(mobileError('98765')).toBe('5 more digits needed.')
    expect(mobileError('987654321')).toBe('1 more digit needed.')
  })

  it('treats blank as fine unless the field is required', () => {
    expect(mobileError('')).toBeNull()
    expect(mobileError('', { required: true })).toBe('Enter a mobile number.')
  })

  it('sends the number in the stored form', () => {
    expect(toE164('98765 43210')).toBe('+919876543210')
  })
})
