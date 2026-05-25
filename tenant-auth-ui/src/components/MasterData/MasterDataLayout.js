import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import './MasterData.css'

/**
 * MasterDataLayout Component
 * Main layout wrapper for all master data pages
 * Includes responsive sidebar navigation
 */
const MasterDataLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  const location = useLocation()
  const contentRef = useRef(null)

  // Scroll main content to top when route changes (e.g., sidebar navigation)
  useEffect(() => {
    // Try scrolling several times after navigation to ensure routed content mounts
    const attemptScroll = () => {
      const container =
        contentRef.current || document.querySelector('.master-content')
      if (container) {
        try {
          container.scrollTo({ top: 0, behavior: 'auto' })
        } catch (e) {
          container.scrollTop = 0
        }
      }
      try {
        window.scrollTo({ top: 0, behavior: 'auto' })
      } catch (e) {
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
      }
    }

    // Schedule multiple attempts (rAF + timeouts) to cover async mount timings
    const rafId = requestAnimationFrame(() => attemptScroll())
    const t1 = setTimeout(attemptScroll, 30)
    const t2 = setTimeout(attemptScroll, 120)
    const t3 = setTimeout(attemptScroll, 300)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [location.pathname])

  return (
    <div className="master-layout">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="master-content" ref={contentRef}>
        <Outlet />
      </main>

      {/* Mobile sidebar toggle button */}
      <button
        className="mobile-sidebar-toggle"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>
    </div>
  )
}

export default MasterDataLayout
