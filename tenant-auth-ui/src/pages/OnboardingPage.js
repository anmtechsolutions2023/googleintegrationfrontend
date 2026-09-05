import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getOnboardingStatus, updateOnboardingNote } from '../services/onboardingService';
import { toast } from 'react-toastify';
import { ROUTES } from '../constants/routes';
import { STRINGS } from '../constants';
import './OnboardingPage.css';

const STATUS_CONFIG = {
  PENDING: {
    icon: '⏳',
    color: '#d69e2e',
    bg: '#fffff0',
    border: '#f6e05e',
    label: 'Pending Review',
  },
  REJECTED: {
    icon: '❌',
    color: '#c53030',
    bg: '#fff5f5',
    border: '#fc8181',
    label: 'Rejected',
  },
  CANCELLED: {
    icon: '🚫',
    color: '#718096',
    bg: '#f7fafc',
    border: '#cbd5e0',
    label: 'Cancelled',
  },
};

const OnboardingPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getOnboardingStatus();
      const data = res.data?.data ?? res.data?.resource ?? res.data;
      setStatus(data);
      setNote(data.requestNote || '');
    } catch {
      toast.error('Failed to fetch your request status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSaveNote = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateOnboardingNote(note);
      toast.success('Note saved. An admin will review your request.');
    } catch {
      toast.error('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN);
  };

  const s = STRINGS.pages.onboarding;
  const cfg = STATUS_CONFIG[status?.status] || STATUS_CONFIG.PENDING;

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <span className="onboarding-app-name">{STRINGS.app.logo} {STRINGS.app.name}</span>
          <button className="onboarding-logout" onClick={handleLogout}>
            {STRINGS.buttons.logout}
          </button>
        </div>

        {loading ? (
          <div className="onboarding-loading">
            <div className="spinner" />
            <p>Loading your request status…</p>
          </div>
        ) : (
          <>
            {/* User info */}
            <div className="onboarding-user-row">
              <div className="onboarding-avatar">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <p className="onboarding-name">{user?.name}</p>
                <p className="onboarding-email">{user?.phone}</p>
              </div>
            </div>

            {/* Status banner */}
            <div
              className="onboarding-status-banner"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <span className="status-icon">{cfg.icon}</span>
              <div>
                <p className="status-title" style={{ color: cfg.color }}>
                  {status?.status === 'PENDING' ? s.pendingTitle
                   : status?.status === 'REJECTED' ? s.rejectedTitle
                   : s.cancelledTitle}
                </p>
                <p className="status-desc">
                  {status?.status === 'PENDING'
                    ? s.pendingDesc
                    : status?.status === 'REJECTED'
                    ? s.rejectedDesc
                    : 'Your request has been cancelled.'}
                </p>
              </div>
            </div>

            {/* Rejection reason */}
            {status?.status === 'REJECTED' && status?.rejectionReason && (
              <div className="rejection-reason">
                <strong>Reason: </strong>{status.rejectionReason}
              </div>
            )}

            {/* Note form — only for PENDING */}
            {status?.status === 'PENDING' && (
              <div className="onboarding-note-section">
                <label className="note-label">{s.noteLabel}</label>
                <textarea
                  className="note-textarea"
                  rows={4}
                  maxLength={500}
                  placeholder={s.notePlaceholder}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="note-footer">
                  <span className="char-count">{note.length}/500</span>
                  <button
                    className="note-save-btn"
                    onClick={handleSaveNote}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : s.saveNote}
                  </button>
                </div>
              </div>
            )}

            {/* Requested at */}
            {status?.requestedAt && (
              <p className="onboarding-meta">
                Request submitted:{' '}
                {new Date(status.requestedAt).toLocaleString()}
              </p>
            )}

            {/* Actions row */}
            <div className="onboarding-actions">
              <button
                className="btn-secondary"
                onClick={() => { setLoading(true); fetchStatus(); }}
              >
                {s.checkStatus}
              </button>
              <button className="btn-ghost" onClick={handleLogout}>
                {STRINGS.buttons.logout}
              </button>
            </div>

            <p className="onboarding-contact">{s.contactAdmin}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
