import React, { createContext, useContext, useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import api from '../api/api'

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
      const res = await api.post('/api/auth/google', { id_token: googleToken })
      const { token } = res.data
      Cookies.set('app_token', token, { expires: 1 / 24, secure: false }) // 1 Hour
      const payload = JSON.parse(window.atob(token.split('.')[1]))
      setUser(payload)
      return true
    } catch (err) {
      // return false
      throw err
    }
  }

  // const logout = () => {
  //   Cookies.remove('app_token')
  //   setUser(null)
  // }

  const logout = async () => {
    // 4. call backend logout endpoint
    await api.post('/api/logout') // Tell backend to log logout

    // 1. Clear the cookie
    Cookies.remove('app_token')

    // 2. Clear the React state
    setUser(null)

    // 3. Clear Axios Headers
    delete api.defaults.headers.common['Authorization']

    // // 4. Force Redirect (This fixes the Audit Page issue)
    // window.location.href = '/login'
  }

  const switchTenant = async (tenantId) => {
    console.log('Switching to tenant:', tenantId)
    try {
      const res = await api.post('/api/switch-tenant', { tenantId })
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
      console.log('Error switching tenant:', err)
      toast.error(err.response?.data?.message || 'Failed to switch tenant')
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
