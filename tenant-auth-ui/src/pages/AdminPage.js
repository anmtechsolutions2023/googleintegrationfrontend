import React, { useEffect, useState } from 'react'
import { getAdminSettings } from '../services/dataService'
import logger from '../utils/logger'

const AdminPage = () => {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    // This call is protected by backend middleware too!
    getAdminSettings()
      .then((res) => setLogs(res.data.resource))
      .catch((err) => logger.error('API Error (admin settings):', err))
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
