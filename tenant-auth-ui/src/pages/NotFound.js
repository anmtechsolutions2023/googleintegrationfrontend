import React from 'react';
import { useNavigate } from 'react-router-dom';
import { STRINGS } from '../constants';
import { ROUTES } from '../constants/routes';

const NotFound = () => {
  const navigate = useNavigate();

  const styles = {
    container: {
      textAlign: 'center',
      marginTop: '100px',
      fontFamily: 'sans-serif',
    },
    errorCode: {
      fontSize: '72px',
      color: '#95a5a6',
    },
    button: {
      padding: '10px 20px',
      cursor: 'pointer',
      backgroundColor: '#3498db',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      marginTop: '20px',
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.errorCode}>{STRINGS.pages.notFound.errorCode}</h1>
      <h2>{STRINGS.pages.notFound.title}</h2>
      <p>{STRINGS.pages.notFound.message}</p>
      <button onClick={() => navigate(ROUTES.DASHBOARD)} style={styles.button}>
        {STRINGS.pages.notFound.backButton}
      </button>
    </div>
  );
};

export default NotFound;
