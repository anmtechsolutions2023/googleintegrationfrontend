import React from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { toast } from 'react-toastify'

const Login = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Redirect back to intended page, or dashboard
  const from = location.state?.from?.pathname || '/dashboard'

  const onSuccess = async (res) => {
    try {
      // res.credential is the JWT from Google
      const result = await login(res.credential)

      if (result) {
        toast.success('🚀 Welcome back!')
        navigate(from, { replace: true })
      }
    } catch (error) {
      const backendData = error.response?.data

      // Check for the specific message you shared: 'Database operation failed...'
      if (backendData?.status === 401 || error.response?.status === 401) {
        // toast.error(`Auth Error: ${backendData?.message || 'Login failed'}`, {
        //   position: 'top-center',
        //   autoClose: 5000,
        //   theme: 'colored',
        // })
        toast.error(`Auth Error: User does not exist!!!`, {
          position: 'top-center',
          autoClose: 5000,
          theme: 'colored',
        })
      } else if (error.response?.status === 403) {
        toast.error('User not found in any tenant system.')
      } else {
        toast.error('An unexpected error occurred.')
      }
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80vh',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          padding: '40px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          textAlign: 'center',
          backgroundColor: '#fff',
        }}
      >
        <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>
          Corporate Login
        </h2>
        <p style={{ color: '#7f8c8d', marginBottom: '30px' }}>
          Sign in to manage your tenant resources.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={onSuccess}
            onError={() => toast.error('Google Sign-In Failed')}
            useOneTap={false} // Prevents unexpected popups
          />
        </div>
      </div>
    </div>
  )
}

export default Login
