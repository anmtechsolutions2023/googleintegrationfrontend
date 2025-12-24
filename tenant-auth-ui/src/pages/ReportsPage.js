import React, { useState, useEffect } from 'react'
import api from '../api/api'

const ReportsPage = () => {
  const [data, setData] = useState([])

  useEffect(() => {
    // This call uses the Axios interceptor automatically
    api
      .get('/api/data/reports')
      .then((res) => setData(res.data))
      .catch((err) => console.error('Could not fetch reports'))
  }, [])

  return (
    <div style={{ padding: '40px' }}>
      <h2>Analytics & Reports</h2>
      <div
        style={{
          marginTop: '20px',
          padding: '20px',
          background: '#fff',
          border: '1px solid #eee',
        }}
      >
        <p>This section is restricted to users with Report access scopes.</p>
        {data.length > 0 ? (
          <pre>{JSON.stringify(data, null, 2)}</pre>
        ) : (
          <p>No reports found for this tenant.</p>
        )}
      </div>
    </div>
  )
}

export default ReportsPage
