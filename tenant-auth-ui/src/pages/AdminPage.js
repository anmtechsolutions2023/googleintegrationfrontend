import React, { useEffect, useState } from 'react';
import { getAdminSettings } from '../services/dataService';
import logger from '../utils/logger';
import { SCOPES, STRINGS } from '../constants';

const AdminPage = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // This call is protected by backend middleware too!
    getAdminSettings()
      .then((res) => setLogs(res.data.resource))
      .catch((err) => logger.error('API Error (admin settings):', err));
  }, []);

  return (
    <div style={{ padding: '40px' }}>
      <h1>{STRINGS.pages.admin.title}</h1>
      <div
        style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}
      >
        <p>
          {STRINGS.pages.admin.description}{' '}
          <strong>{SCOPES.TENANT_ADMIN}</strong>{' '}
          {STRINGS.pages.admin.scopeLabel}
        </p>
        <pre>{JSON.stringify(logs, null, 2)}</pre>
      </div>
    </div>
  );
};

export default AdminPage;
