import React from 'react';
import { useNavigate } from 'react-router-dom';
import { STRINGS } from '../constants';
import { ROUTES } from '../constants/routes';

const Forbidden = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        textAlign: 'center',
        marginTop: '100px',
        fontFamily: 'sans-serif',
      }}
    >
      <h1 style={{ fontSize: '72px', color: '#e74c3c' }}>
        {STRINGS.pages.forbidden.errorCode}
      </h1>
      <h2>{STRINGS.pages.forbidden.title}</h2>
      <p>{STRINGS.pages.forbidden.message}</p>
      <button
        onClick={() => navigate(ROUTES.DASHBOARD)}
        style={{
          padding: '10px 20px',
          cursor: 'pointer',
          backgroundColor: '#3498db',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        {STRINGS.buttons.goToDashboard}
      </button>
    </div>
  );
};

export default Forbidden;
