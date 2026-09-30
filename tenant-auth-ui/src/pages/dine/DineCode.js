import React, { useEffect, useRef, useState } from 'react'
import { BackIcon, InfoIcon } from './DineIcons'
import { useCountdown, mmss } from '../../hooks/useCountdown'
import { groupNational } from '../../utils/phone'

/**
 * D3 — the WhatsApp code.
 *
 * One input under six drawn boxes, like the staff sign-in: WhatsApp's "Copy
 * code" means the usual action is a paste, which a single field and
 * one-time-code autofill handle natively.
 */
const DineCode = ({ phone, challenge, busy, error, onBack, onResend, onSubmit }) => {
  const [code, setCode] = useState('')
  const inputRef = useRef(null)
  const expiresIn = useCountdown(challenge?.expiresInSeconds ?? 0, !!challenge)
  const resendIn = useCountdown(challenge?.resendInSeconds ?? 0, !!challenge)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setCode('') }, [challenge])

  const submit = (e) => {
    e.preventDefault()
    if (code.length === 6 && !busy) onSubmit(code)
  }

  return (
    <form className="dine-screen" onSubmit={submit} noValidate>
      <main className="dine-pad">
        <div className="dine-top">
          <button type="button" className="dine-icon-btn" onClick={onBack} aria-label="Change number"><BackIcon /></button>
          <div className="dine-top-title" />
          <div style={{ width: 44 }} />
        </div>

        <div className="dine-stack">
          <div className="dine-eyebrow">Step 2 of 2</div>
          <h1 className="dine-display dine-h1">Enter the code</h1>
          <p className="dine-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
            Sent on WhatsApp to <strong style={{ color: 'var(--dine-ink)' }}>+91 {groupNational(phone)}</strong>.{' '}
            <button type="button" className="dine-link" onClick={onBack}>Change</button>
          </p>
        </div>

        <div className="dine-stack" style={{ gap: 10 }}>
          <label className="dine-label" htmlFor="dine-code">6-digit code</label>
          <div className="dine-code">
            <div className="dine-code-boxes" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`dine-code-box ${i === code.length ? 'is-next' : ''}`}>{code[i] || ''}</div>
              ))}
            </div>
            <input
              id="dine-code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy}
            />
          </div>
          <div className="dine-timers">
            <span>{expiresIn > 0 ? `Code expires in ${mmss(expiresIn)}` : 'Code expired'}</span>
            {resendIn > 0
              ? <span>Resend in {mmss(resendIn)}</span>
              : <button type="button" className="dine-link" onClick={onResend} disabled={busy}>Resend code</button>}
          </div>
          {error && <div className="dine-error" role="alert">{error}</div>}
        </div>

        <div className="dine-callout dine-callout-warm">
          <InfoIcon />
          <span>No message? Check the number has WhatsApp. After 5 wrong tries the code stops working and you can ask for a new one.</span>
        </div>

        <div className="dine-spacer" />
        <button type="submit" className="dine-btn dine-btn-primary" disabled={code.length !== 6 || busy || expiresIn === 0}>
          {busy ? 'Checking…' : 'Verify and see menu'}
        </button>
      </main>
    </form>
  )
}

export default DineCode
