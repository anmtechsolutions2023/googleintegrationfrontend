import React, { createContext, useContext, useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import logger from '../utils/logger'
import api from '../api/api'
import {
  login as authLogin,
  logout as authLogout,
  switchTenant as authSwitch,
} from '../services/authService'
import { toast } from 'react-toastify'
import MESSAGES from '../constants/messages'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = Cookies.get('app_token')
    if (token) {
      try {
        const payload = JSON.parse(window.atob(token.split('.')[1]))
        setUser(payload)
      } catch (e) {
        Cookies.remove('app_token')
      }
    }
    setLoading(false)
  }, [])

  const login = async (googleToken) => {
    try {
      const res = await authLogin(googleToken)
      const { token } = res.data
      Cookies.set('app_token', token, { expires: 1 / 24, secure: false }) // 1 Hour
      const payload = JSON.parse(window.atob(token.split('.')[1]))
      setUser(payload)
      return true
    } catch (err) {
      throw err
    }
  }

  const logout = async () => {
    // 1. Attempt backend logout (don't block cleanup if it fails)
    try {
      await authLogout()
    } catch (err) {
      logger.warn('Backend logout failed:', err)
    }

    // 2. Clear the cookie
    Cookies.remove('app_token')

    // 3. Clear the React state
    setUser(null)

    // 4. Clear Axios Headers
    delete api.defaults.headers.common['Authorization']

    // // 4. Force Redirect (This fixes the Audit Page issue)
    // window.location.href = '/login'
  }

  const switchTenant = async (tenantId) => {
    logger.debug('Switching to tenant:', tenantId)
    try {
      const res = await authSwitch(tenantId)
      const { token } = res.data

      // Update Cookie
      Cookies.set('app_token', token, { expires: 1 / 24 })

      // Update State (decoding the new JWT)
      const payload = JSON.parse(window.atob(token.split('.')[1]))
      setUser(payload)

      // toast.success(`Switched to Tenant: ${tenantId.substring(0, 8)}...`)

      // Optional: Redirect to dashboard to refresh all page data for the new tenant
      window.location.href = '/dashboard'
    } catch (err) {
      logger.error('Error switching tenant:', err)
      toast.error(err.response?.data?.message || MESSAGES.error.switchTenant)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, login, logout, loading, switchTenant }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
