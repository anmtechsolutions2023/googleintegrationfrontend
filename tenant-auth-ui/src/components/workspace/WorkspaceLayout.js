import React, { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import WorkspaceRail from './WorkspaceRail'
import WorkspaceHeader from './WorkspaceHeader'
import { FrontDeskProvider } from '../../context/FrontDeskContext'
import { OrderLinkProvider } from '../frontdesk/OrderLinkProvider'
import '../frontdesk/frontdesk.css'
import './workspace.css'

/**
 * The shell every workspace screen renders in: the rail on the left, the
 * workspace's tabs on top, the screen below.
 *
 * Replaces the Front Desk layout and its 38-item sidebar. The providers are the
 * ones that layout mounted, so every screen moved in keeps working unchanged:
 * shared POS state, and the order-number link any screen can open.
 */
const WorkspaceLayout = () => {
  const { pathname } = useLocation()
  const contentRef = useRef(null)

  // A new screen starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    const el = contentRef.current
    if (el) {
      try { el.scrollTo({ top: 0, behavior: 'auto' }) } catch { el.scrollTop = 0 }
    }
    try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { /* jsdom */ }
  }, [pathname])

  return (
    <FrontDeskProvider>
      <OrderLinkProvider>
        <div className="ws-layout">
          <WorkspaceRail />
          <div className="ws-main" ref={contentRef}>
            <WorkspaceHeader />
            <main className="ws-content frontdesk-content">
              <Outlet />
            </main>
          </div>
        </div>
      </OrderLinkProvider>
    </FrontDeskProvider>
  )
}

export default WorkspaceLayout
