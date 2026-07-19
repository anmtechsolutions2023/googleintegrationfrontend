import React, { useState, useEffect } from 'react';
import { getReports } from '../services/dataService';
import logger from '../utils/logger';
import { STRINGS } from '../constants';

const ReportsPage = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    // This call uses the Axios interceptor automatically
    getReports()
      .then((res) => setData(res.data))
      .catch((err) => logger.error('Could not fetch reports', err));
  }, []);

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 40px)' }}>
      <h2>{STRINGS.pages.reports.title}</h2>
      <div
        style={{
          marginTop: '20px',
          padding: '20px',
          background: '#fff',
          border: '1px solid #eee',
        }}
      >
        <p>{STRINGS.pages.reports.description}</p>
        {data.length > 0 ? (
          <pre style={{ overflowX: 'auto', maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(data, null, 2)}</pre>
        ) : (
          <p>{STRINGS.emptyStates.noReports}</p>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
