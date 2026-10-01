import React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { visibleSections } from '../../config/workspaces'
import QrOrderAlert from '../frontdesk/QrOrderAlert'

// Components a tab may show above its sections, named in the config by key so
// the config stays plain data.
const BANNERS = {
  qrAlert: QrOrderAlert,
}

/**
 * A tab made of several screens that used to be separate pages — Options is
 * Variants, Add-on Groups and Add-ons; Floor is Order & bill, Tables and the
 * QR inbox. A segmented switcher picks the section; the section's own page
 * renders below it unchanged.
 */
const SectionedTab = ({ tab }) => {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const sections = visibleSections(tab, user)
  const Banner = tab.banner ? BANNERS[tab.banner] : null

  return (
    <div className="ws-sectioned">
      {Banner && <Banner />}
      {sections.length > 1 && (
        <div className="ws-sections" role="tablist" aria-label="Sections">
          {sections.map((s) => {
            const to = `${tab.path}/${s.key}`
            const active = pathname === to || pathname.startsWith(`${to}/`)
            return (
              <Link key={s.key} to={to} role="tab" aria-selected={active} className={`ws-section ${active ? 'is-active' : ''}`}>
                {s.label}
              </Link>
            )
          })}
        </div>
      )}
      <Outlet />
    </div>
  )
}

export default SectionedTab
