import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Cookies from 'js-cookie';
import { AuthProvider, useAuth } from '../AuthContext';
import { TOKEN_REFRESHED_EVENT } from '../../api/api';

// When somebody's access changes mid-session, the server answers with a
// re-signed token. The API client announces it; AuthContext swaps it in, so
// the rail and the buttons catch up without anybody signing out.

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const tokenWith = (scopes) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
  phone: '+919800000001', tid: 't1', scopes, onboardingStatus: 'APPROVED',
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const Scopes = () => {
  const { user } = useAuth();
  return <span data-testid="scopes">{(user?.scopes || []).join(',')}</span>;
};

afterEach(() => Cookies.remove('app_token'));

it('replaces the session with a refreshed token from the server', async () => {
  render(<AuthProvider><Scopes /></AuthProvider>);
  await act(async () => {
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESHED_EVENT, { detail: tokenWith(['POS_ORDER:READ', 'TENANT:ADMIN']) }));
  });
  expect(screen.getByTestId('scopes')).toHaveTextContent('POS_ORDER:READ,TENANT:ADMIN');
});
