import React, { useState } from 'react'
import { BackIcon, CheckIcon } from './DineIcons'
import { digitsOnly, groupNational, looksComplete, mobileError } from '../../utils/phone'

/**
 * D2 — the guest's mobile number.
 *
 * Checked as they type with the SAME rule every other phone field in the app
 * uses (utils/phone.mobileError): ten digits starting 6–9. The server
 * normalises and checks again; this only lets a guest fix a typo before a code
 * is spent on it.
 */
const DinePhone = ({ venue, busy, error, onBack, onSubmit }) => {
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(true)

  const typed = digitsOnly(phone).length > 0
  const problem = mobileError(phone)
  const valid = looksComplete(phone)
  const ready = valid && consent && !busy

  let help = 'Indian mobile numbers only: 10 digits starting with 6, 7, 8 or 9.'
  let tone = ''
  if (typed && problem) { help = problem; tone = /start with/.test(problem) ? 'is-bad' : '' }
  if (valid) { help = `The code goes to WhatsApp on +91 ${groupNational(phone)}.`; tone = 'is-ok' }
  if (error) { help = error; tone = 'is-bad' }

  const submit = (e) => {
    e.preventDefault()
    if (ready) onSubmit(phone)
  }

  const place = venue.businessName || venue.branchName || ''

  return (
    <form className="dine-screen" onSubmit={submit} noValidate>
      <main className="dine-pad">
        <div className="dine-top">
          <button type="button" className="dine-icon-btn" onClick={onBack} aria-label="Back"><BackIcon /></button>
          <div className="dine-top-title">{[place, venue.tableName].filter(Boolean).join(' · ')}</div>
          <div style={{ width: 44 }} />
        </div>

        <div className="dine-stack">
          <div className="dine-eyebrow">Step 1 of 2</div>
          <h1 className="dine-display dine-h1">Your mobile number</h1>
          <p className="dine-muted" style={{ margin: 0, fontSize: 15 }}>We will send a 6-digit code on WhatsApp.</p>
        </div>

        <div className="dine-stack">
          <label className="dine-label" htmlFor="dine-phone">Mobile number</label>
          <div className={`dine-phone ${tone}`}>
            <span className="dine-dial" aria-hidden="true">+91</span>
            <input
              id="dine-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={groupNational(phone)}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby="dine-phone-help"
              aria-invalid={tone === 'is-bad'}
              disabled={busy}
            />
            {valid && <span style={{ color: 'var(--dine-ok)', marginRight: 14 }}><CheckIcon /></span>}
          </div>
          <div id="dine-phone-help" className={`dine-help ${tone}`} role={error ? 'alert' : undefined}>{help}</div>
        </div>

        <label className="dine-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Save my number with {place || 'this restaurant'} so they can see my visits and orders.</span>
        </label>

        <div className="dine-spacer" />
        <button type="submit" className="dine-btn dine-btn-primary" disabled={!ready}>
          {busy ? 'Sending…' : 'Send code on WhatsApp'}
        </button>
      </main>
    </form>
  )
}

export default DinePhone
