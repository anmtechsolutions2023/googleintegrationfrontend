import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { MESSAGES, STRINGS, APP_CONFIG, ERROR_CODES } from '../constants';
import { ROUTES } from '../constants/routes';
import { peekRedirect, clearRedirect } from '../utils/redirectStore';
import { isSetupPending } from '../utils/permissions';
import { requestOtp } from '../services/authService';
import { groupNational, looksComplete } from '../utils/phone';
import './login.css';

const STEP = { PHONE: 'phone', CODE: 'code' };

/** Counts down to zero once, from a fresh start value. */
const useCountdown = (seconds, active) => {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (!active) return undefined;
    const id = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [seconds, active]);
  return left;
};

const mmss = (total) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve where to send the user after login, evaluated once on mount:
  //  1. React Router state (client-side guard redirect)
  //  2. sessionStorage (session-expiry hard redirect from the API interceptor)
  //  3. dashboard fallback
  // peekRedirect() does NOT clear, so refreshing the login page before logging
  // in still resolves the same destination; it's cleared after login succeeds.
  const [from] = useState(
    () => location.state?.from?.pathname || peekRedirect() || ROUTES.DASHBOARD
  );

  const [step, setStep] = useState(STEP.PHONE);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);

  const expiresIn = useCountdown(challenge?.expiresInSeconds ?? 0, step === STEP.CODE);
  const resendIn = useCountdown(challenge?.resendInSeconds ?? 0, step === STEP.CODE);

  useEffect(() => {
    if (step === STEP.CODE) codeRef.current?.focus();
  }, [step]);

  const s = STRINGS.pages.login;

  /** Where a signed-in user belongs. Unchanged from the Google flow. */
  const routeAfterLogin = useCallback((payload) => {
    clearRedirect();
    if (payload.onboardingStatus !== 'APPROVED') {
      toast.info('Your access request is pending review.');
      navigate(ROUTES.ONBOARDING, { replace: true });
    } else if (isSetupPending(payload)) {
      // First-time tenant admin: land them on the setup wizard so they focus on
      // setting up their tenancy, not on Home.
      toast.success(MESSAGES.success.welcome);
      navigate(ROUTES.MASTER_SETUP, { replace: true });
    } else {
      toast.success(MESSAGES.success.welcome);
      // Don't bounce approved users back to /onboarding if that's where they came from
      const destination = from === ROUTES.ONBOARDING ? ROUTES.DASHBOARD : from;
      navigate(destination, { replace: true });
    }
  }, [from, navigate]);

  /**
   * The server answers identically for a registered and an unregistered
   * number, so a success here is NOT confirmation that the number is known —
   * it only means a code is on its way if one could be.
   */
  const sendCode = async (event) => {
    event?.preventDefault();
    if (!looksComplete(phone) || busy) return;
    setBusy(true);
    try {
      const res = await requestOtp(phone);
      setChallenge(res.data?.data ?? { expiresInSeconds: 300, resendInSeconds: 60 });
      setCode('');
      setStep(STEP.CODE);
    } catch (error) {
      toast.error(
        error.response?.data?.message
          || MESSAGES.error[ERROR_CODES.GENERIC_ERROR]
      );
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event) => {
    event?.preventDefault();
    if (code.length < 4 || busy) return;
    setBusy(true);
    try {
      const payload = await login({ challengeId: challenge.challengeId, code });
      if (payload) routeAfterLogin(payload);
    } catch (error) {
      const message = error.response?.data?.message;
      toast.error(message || MESSAGES.error[ERROR_CODES.GENERIC_ERROR], {
        position: APP_CONFIG.TOAST.ERROR_POSITION,
        autoClose: APP_CONFIG.TOAST.ERROR_DURATION_MS,
        theme: APP_CONFIG.TOAST.THEME,
      });
      // An expired or burnt challenge cannot be retried — send them back to ask
      // for a new one rather than leaving them typing into a dead field.
      if (error.response?.status === 410 || error.response?.status === 429) {
        setStep(STEP.PHONE);
        setChallenge(null);
      }
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      {/* The panel is #1a1a2e — the colour the POS sidebar becomes a moment
          later — so signing in reads as entering the app, not passing a gate. */}
      <div className="login-brand">
        <div className="login-mark">
          <svg viewBox="0 0 32 32" width="30" height="30" role="img" aria-label={STRINGS.app.name}>
            <path d="M4 23h24" stroke="#4fc3f7" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M6.5 22a9.5 9.5 0 0 1 19 0" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="8.2" r="1.9" fill="#4fc3f7" />
          </svg>
          <span>{STRINGS.app.name}</span>
        </div>

        <div className="login-copy">
          <h2 className="login-headline">{s.headline}</h2>
          <p className="login-blurb">{s.blurb}</p>
        </div>

        <div className="login-bottom">
          <div className="login-tags">
            {s.capabilities.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p className="login-foot">{s.access}</p>
        </div>
      </div>

      <div className="login-main">
        <div className="login-card">
          {step === STEP.PHONE ? (
            <form className="login-step" onSubmit={sendCode} noValidate>
              <div className="login-head">
                <h1>{s.title}</h1>
                <p className="login-sub">{s.subtitle}</p>
              </div>

              <div className="login-field">
                <label htmlFor="login-phone">{s.phoneLabel}</label>
                <div className="login-phone-row">
                  <span className="login-dial" aria-hidden="true">+91</span>
                  <input
                    id="login-phone"
                    // inputMode drives the on-screen keypad: a till runs on a
                    // tablet, and type alone does not guarantee a numeric pad.
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={groupNational(phone)}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={busy}
                    aria-describedby="login-phone-help"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="login-primary"
                disabled={!looksComplete(phone) || busy}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>{busy ? s.sending : s.sendCode}</span>
              </button>

              <p className="login-note" id="login-phone-help">{s.firstTime}</p>
            </form>
          ) : (
            <form className="login-step" onSubmit={submitCode} noValidate>
              <div className="login-head">
                <button
                  type="button"
                  className="login-back"
                  onClick={() => { setStep(STEP.PHONE); setChallenge(null); }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                  <span className="sr-only">{s.changeNumber}</span>
                </button>
                <h1>{s.codeTitle}</h1>
                <p className="login-sub">
                  {s.sentTo} +91 {groupNational(phone)}
                </p>
              </div>

              <div className="login-field">
                <label htmlFor="login-code">{s.codeLabel}</label>
                {/* One input, not six boxes. WhatsApp's Copy code button means
                    the common interaction is a PASTE, which a single field and
                    one-time-code autofill handle natively; six boxes would need
                    hand-written paste and backspace behaviour to match it. */}
                <input
                  id="login-code"
                  ref={codeRef}
                  className="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="······"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                />
              </div>

              <div className="login-timers">
                <span>{expiresIn > 0 ? `${s.expiresIn} ${mmss(expiresIn)}` : s.expired}</span>
                {resendIn > 0 ? (
                  <span className="login-muted">{s.resendIn} {mmss(resendIn)}</span>
                ) : (
                  <button type="button" className="login-link" onClick={sendCode} disabled={busy}>
                    {s.resend}
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="login-primary"
                disabled={code.length < 4 || busy || expiresIn === 0}
              >
                {busy ? s.verifying : s.verify}
              </button>

              <p className="login-note">{s.noCode}</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
