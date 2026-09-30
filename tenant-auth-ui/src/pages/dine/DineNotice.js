import React from 'react'
import { InfoIcon } from './DineIcons'

/** D9 — every way a guest can be stopped, each with a way forward. */
export const NOTICES = {
  inactive: {
    title: 'This QR code isn’t active',
    body: 'Please ask a staff member to take your order.',
  },
  ended: {
    title: 'Your session has ended',
    body: 'Scan the QR code on your table again to keep ordering. Your earlier orders are safe.',
  },
  paused: {
    title: 'Ordering by phone is paused',
    body: 'We can’t send codes right now. Your server will take your order.',
  },
  offline: {
    title: 'We couldn’t reach the restaurant',
    body: 'Check your connection and try again.',
  },
}

const DineNotice = ({ kind, message, onRetry }) => {
  const notice = NOTICES[kind] || NOTICES.offline
  return (
    <div className="dine-screen">
      <main className="dine-notice" role="alert">
        <div className="dine-notice-icon"><InfoIcon /></div>
        <h1 className="dine-display" style={{ fontSize: 26 }}>{notice.title}</h1>
        <p className="dine-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{message || notice.body}</p>
        <div className="dine-spacer" />
        {onRetry && <button type="button" className="dine-btn dine-btn-outline" onClick={onRetry}>Try again</button>}
      </main>
    </div>
  )
}

export default DineNotice
