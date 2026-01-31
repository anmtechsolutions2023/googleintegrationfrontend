import React from 'react';
import { useAuth } from '../context/AuthContext';
import { STRINGS } from '../constants';

const Dashboard = () => {
  const { user } = useAuth();

  // Define styles as an object to keep JSX clean
  const styles = {
    container: { padding: '40px', maxWidth: '800px', margin: '0 auto' },
    card: {
      border: '1px solid #ddd',
      padding: '20px',
      borderRadius: '10px',
      backgroundColor: '#fff',
    },
    list: {
      display: 'flex',
      gap: '10px',
      listStyle: 'none',
      padding: 0,
      flexWrap: 'wrap',
    },
    badge: {
      background: '#e1f5fe',
      padding: '5px 10px',
      borderRadius: '4px',
      fontSize: '12px',
      color: '#01579b',
    },
  };

  return (
    <div style={styles.container}>
      <h1>{STRINGS.pages.dashboard.title}</h1>
      <div style={styles.card}>
        <h3>
          {STRINGS.pages.dashboard.welcome}{' '}
          {user?.name || STRINGS.pages.dashboard.defaultUserName}!
        </h3>
        <p>
          <strong>{STRINGS.labels.email}</strong> {user?.email}
        </p>
        <p>
          <strong>{STRINGS.labels.activeTenantId}</strong>{' '}
          <code>{user?.tid}</code>
        </p>

        <p>
          <strong>{STRINGS.labels.assignedScopes}</strong>
        </p>
        {user?.scopes && user.scopes.length > 0 ? (
          <ul style={styles.list}>
            {user.scopes.map((scope, index) => (
              <li key={index} style={styles.badge}>
                {scope}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#999', fontSize: '14px' }}>
            {STRINGS.emptyStates.noScopes}
          </p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
