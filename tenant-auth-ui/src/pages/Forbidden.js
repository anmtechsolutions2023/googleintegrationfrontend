import React from 'react'
import { useNavigate } from 'react-router-dom'

const Forbidden = () => {
  const navigate = useNavigate()
  return (
    <div
      style={{
        textAlign: 'center',
        marginTop: '100px',
        fontFamily: 'sans-serif',
      }}
    >
      <h1 style={{ fontSize: '72px', color: '#e74c3c' }}>403</h1>
      <h2>Access Denied</h2>
      <p>You do not have the required permissions for this feature.</p>
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          padding: '10px 20px',
          cursor: 'pointer',
          backgroundColor: '#3498db',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        Go to Dashboard
      </button>
    </div>
  )
}

export default Forbidden
