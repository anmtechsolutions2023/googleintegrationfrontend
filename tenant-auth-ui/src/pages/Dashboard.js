import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { STRINGS } from '../constants';
import { getMyCapabilities } from '../services/authService';
import './dashboard.css';

/**
 * Dashboard — what the signed-in person can actually do.
 *
 * This page used to print the raw scope strings off the token: 28 chips reading
 * POS_BILLING:WRITE, which tell somebody who does not build the software
 * nothing at all. The server now resolves them — grouped, worded, and with READ
 * and WRITE on one subject collapsed into a single line stating the level.
 *
 * The codes are still here behind a disclosure, because support asks for them.
 * They are simply no longer the answer to "what can I do".
 */
const Dashboard = () => {
  const { user } = useAuth();
  const [caps, setCaps] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setCaps(await getMyCapabilities());
      setFailed(false);
    } catch {
      // Falling back to the raw list is not a good page, but it is a truthful
      // one — better than telling somebody they have no access when they do.
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = (caps?.groups || []).reduce((n, g) => n + g.capabilities.length, 0);
  const scopes = caps?.scopes || user?.scopes || [];

  return (
    <div className="dash-page">
      <div className="dash-head">
        <h1>{STRINGS.pages.dashboard.title}</h1>
        <p>
          {STRINGS.pages.dashboard.welcome} {user?.name || STRINGS.pages.dashboard.defaultUserName}
          {user?.email ? ` · ${user.email}` : ''}
        </p>
      </div>

      {(caps?.ranks || []).map((rank) => (
        <div className="dash-card dash-rank" key={rank.scope}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 8.5-4.1-.8-7-4.3-7-8.5V6l7-3z"
              fill="none" stroke="#0f3460" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8.8 12.1l2.1 2.1 4.3-4.3"
              fill="none" stroke="#0f3460" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="dash-rank-body">
            <h2>{rank.label}</h2>
            <p>{rank.note}</p>
          </div>
        </div>
      ))}

      <div className="dash-section-head">
        <h2>{STRINGS.pages.dashboard.capabilitiesTitle}</h2>
        {total > 0 && (
          <span>
            {total} {total === 1 ? 'permission' : 'permissions'} across{' '}
            {caps.groups.length} {caps.groups.length === 1 ? 'area' : 'areas'}
          </span>
        )}
      </div>

      {total > 0 ? (
        <div className="dash-groups">
          {caps.groups.map((group) => (
            <div className="dash-card" key={group.key}>
              <p className="dash-cat">{group.label}</p>
              <div>
                {group.capabilities.map((cap) => (
                  <div
                    className={`dash-cap${cap.named ? '' : ' dash-cap-unnamed'}`}
                    key={cap.scopes.join(',')}
                  >
                    <span className="dash-cap-main">
                      <span className="dash-cap-name" title={cap.scopes.join(', ')}>
                        {cap.label}
                      </span>
                      {/* The menu items this opens, generated from the routing.
                          Named after what it does, so nobody has to guess what
                          "Menu & setup" covers. */}
                      {cap.screens?.length > 0 && (
                        <span className="dash-cap-screens">{cap.screens.join(' · ')}</span>
                      )}
                    </span>
                    <span className={`dash-level ${cap.level}`}>{cap.levelLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dash-card">
          <p className="dash-empty">
            {failed
              ? STRINGS.pages.dashboard.capabilitiesUnavailable
              : STRINGS.emptyStates.noScopes}
          </p>
        </div>
      )}

      <details className="dash-card dash-tech">
        <summary>{STRINGS.pages.dashboard.technicalDetail}</summary>
        <div className="dash-tech-body">
          <p>{STRINGS.pages.dashboard.technicalHint}</p>
          <p className="dash-codes">
            {STRINGS.labels.activeTenantId} {user?.tid || '—'}
          </p>
          {scopes.length > 0 && <p className="dash-codes">{scopes.join(', ')}</p>}
        </div>
      </details>
    </div>
  );
};

export default Dashboard;
