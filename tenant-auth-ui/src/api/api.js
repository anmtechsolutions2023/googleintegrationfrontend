import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
})

api.interceptors.request.use((config) => {
  const token = Cookies.get('app_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// api.interceptors.response.use(
//   (res) => res,
//   (err) => {
//     if (err.response?.status === 401) {
//       Cookies.remove('app_token')
//       window.location.href = '/login?session=expired'
//     }
//     return Promise.reject(err)
//   }
// )

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Check if the error is 401 AND it's NOT the login request
    const isLoginRequest = err.config.url.includes('/api/auth/google')

    if (err.response?.status === 401 && !isLoginRequest) {
      Cookies.remove('app_token')
      // Only redirect if it's an expired session, not a failed login attempt
      window.location.href = '/login?session=expired'
    }

    return Promise.reject(err)
  }
)

export default api
