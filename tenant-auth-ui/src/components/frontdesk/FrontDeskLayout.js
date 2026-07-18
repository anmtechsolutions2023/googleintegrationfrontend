import React, { useState, useEffect, useRef } from 'react'
import { useLocation, Outlet } from 'react-router-dom'
import FrontDeskSidebar from './FrontDeskSidebar'
import { FrontDeskProvider } from '../../context/FrontDeskContext'
import './frontdesk.css'

const FrontDeskLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const contentRef = useRef(null)

  useEffect(() => {
    const attemptScroll = () => {
      const container = contentRef.current || document.querySelector('.frontdesk-content')
      if (container) {
        try { container.scrollTo({ top: 0, behavior: 'auto' }) } catch { container.scrollTop = 0 }
      }
      try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch {
        document.documentElement.scrollTop = 0
      }
    }
    const raf = requestAnimationFrame(attemptScroll)
    const t = setTimeout(attemptScroll, 100)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [location.pathname])

  return (
    <FrontDeskProvider>
      <div className="frontdesk-layout">
        {sidebarOpen && (
          <div className="fd-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <FrontDeskSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="frontdesk-content" ref={contentRef}>
          <Outlet />
        </main>

        <button
          className="fd-mobile-toggle"
          aria-label="Toggle POS navigation"
          onClick={() => setSidebarOpen((prev) => !prev)}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      </div>
    </FrontDeskProvider>
  )
}

export default FrontDeskLayout
