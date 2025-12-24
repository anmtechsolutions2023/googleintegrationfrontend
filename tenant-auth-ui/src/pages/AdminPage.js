import React, { useEffect, useState } from 'react'
import api from '../api/api'

const AdminPage = () => {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    // This call is protected by backend middleware too!
    api
      .get('/api/data/admin/settings')
      .then((res) => setLogs(res.data.resource))
      .catch((err) => console.error('API Error:', err))
  }, [])

  return (
    <div style={{ padding: '40px' }}>
      <h1>Tenant Admin Settings</h1>
      <div
        style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}
      >
        <p>
          This data is only visible to users with <strong>TENANT:ADMIN</strong>{' '}
          scope.
        </p>
        <pre>{JSON.stringify(logs, null, 2)}</pre>
      </div>
    </div>
  )
}

export default AdminPage
