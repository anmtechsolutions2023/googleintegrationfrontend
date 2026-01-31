import React from 'react';
import { STRINGS } from '../constants';

const LoadingSpinner = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <div className="spinner"></div>
    <p>{STRINGS.components.loadingSpinner.message}</p>
    <style>{`
      .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
  </div>
);

export default LoadingSpinner;
