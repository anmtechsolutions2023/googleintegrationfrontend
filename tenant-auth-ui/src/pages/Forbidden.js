import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { SCOPES } from '../constants/scopes';
import { ROUTES } from '../constants/routes';
import { homePathFor, workspaceOfPath } from '../config/workspaces';
import { scopeLabel } from '../config/permissionCatalogue';
import { roleLabel } from '../utils/roleLabels';
import { formatForDisplay } from '../utils/phone';
import adminService from '../services/adminService';
import './Forbidden.css';

const ADMIN_ONLY = [SCOPES.TENANT_ADMIN, SCOPES.TENANT_SUPER_ADMIN];

/**
 * What a member sees when ScopeGuard refuses a screen.
 *
 * It used to be a bare "403 / Access Denied / You do not have the required
 * permissions" in fixed colours, naming neither what was missing nor who could
 * grant it. This says both: what the screen needs, in the same words as the
 * role editor, what this person holds, and which of their colleagues can give
 * them access — with a request they can copy and send.
 *
 * @param {Object} props
 * @param {string[]} [props.requiredScopes] - The guard's list; any one opens the screen.
 */
const Forbidden = ({ requiredScopes = [] }) => {
  const { user } = useAuth() || {};
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [admins, setAdmins] = useState(null);

  useEffect(() => {
    let live = true;
    if (!user?.tid) return undefined;
    adminService.listAdministrators()
      .then((rows) => { if (live) setAdmins(rows); })
      .catch(() => { if (live) setAdmins([]); });
    return () => { live = false; };
  }, [user?.tid]);

  // The platform console: only the platform owner opens it, and nobody in a
  // tenancy can grant that, so there is nobody here to ask.
  const platformOnly = requiredScopes.length > 0
    && requiredScopes.every((s) => s === SCOPES.TENANT_SUPER_ADMIN);
  // TENANT:SUPER_ADMIN passes every guard, so it is never the thing to ask for.
  const needed = requiredScopes.filter((s) => s !== SCOPES.TENANT_SUPER_ADMIN);
  const adminOnly = needed.length > 0 && needed.every((s) => ADMIN_ONLY.includes(s));
  // Reached without a guard (the bare /forbidden route): nothing to name.
  const unknown = !platformOnly && needed.length === 0;
  // Admins pass every screen by administration, so a business permission is
  // what an ordinary member would ask for; the Admin switch is named last.
  const permissions = needed.filter((s) => !ADMIN_ONLY.includes(s));

  const roles = (user?.roles || []).map((name) => roleLabel({ name }));
  const home = (user && homePathFor(user)) || ROUTES.DASHBOARD;
  const homeName = workspaceOfPath(home)?.workspace || 'Home';
  const screenName = workspaceOfPath(pathname)?.workspace;

  const request = [
    `Please give me access to ${pathname}${screenName ? ` (${screenName})` : ''} in Restro OS.`,
    adminOnly
      ? 'It needs the Admin switch on my membership.'
      : `It needs one of: ${permissions.map(scopeLabel).join('; ')}.`,
    `I am ${user?.name || 'a member'}${user?.phone ? ` (${formatForDisplay(user.phone)})` : ''}`
      + `${roles.length ? `, currently ${roles.join(', ')}` : ''}.`,
  ].join(' ');

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(request);
      toast.success('Request copied — paste it to an administrator');
    } catch {
      toast.info(request, { autoClose: false });
    }
  };

  return (
    <div className="fb-page">
      <section className="fb-card" aria-labelledby="fb-title">
        <span className="fb-eyebrow">You don&apos;t have access to this screen</span>
        <h1 id="fb-title" className="fb-title">
          {platformOnly ? 'This screen is for the platform owner'
            : unknown ? 'Ask an administrator for access'
              : adminOnly ? `${screenName || 'This screen'} is for administrators`
                : `${screenName || 'This screen'} needs a permission you don’t have`}
        </h1>

        {platformOnly ? (
          <p className="fb-body">
            Only the platform super admin can open it. It covers every restaurant on the platform,
            so no role or Admin switch inside a tenancy opens it.
          </p>
        ) : (
        <p className="fb-body">
          {roles.length
            ? <>You are signed in as <strong>{roles.join(', ')}</strong> in this tenancy.</>
            : <>You are signed in, but you hold no roles in this tenancy yet.</>}
          {' '}
          {adminOnly
            ? <>This screen opens with the <strong>Admin switch</strong>, which an administrator turns on for a person. No role opens it.</>
            : unknown
              ? <>An administrator can tell you which role you need.</>
              : <>It opens with any one of the permissions below, or with the <strong>Admin switch</strong>.</>}
        </p>
        )}

        {!adminOnly && permissions.length > 0 && (
          <ul className="fb-needs" aria-label="Permissions that open this screen">
            {permissions.map((s) => <li key={s}>{scopeLabel(s)}</li>)}
          </ul>
        )}

        {!platformOnly && (
        <div className="fb-admins">
          <span className="fb-label">Who can give you access</span>
          {admins === null && <span className="fb-muted">Looking them up…</span>}
          {admins && admins.length === 0 && (
            <span className="fb-muted">Nobody in this tenancy has the Admin switch. Contact your platform support.</span>
          )}
          {admins && admins.length > 0 && (
            <ul>
              {admins.map((a) => (
                <li key={a.phone}>
                  {a.name && a.name !== a.phone ? `${a.name} · ` : ''}{formatForDisplay(a.phone)}
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        <div className="fb-actions">
          <button type="button" className="fd-btn fd-btn-primary" onClick={() => navigate(home)}>
            Back to {homeName}
          </button>
          {!platformOnly && (
            <button type="button" className="fd-btn fd-btn-outline" onClick={copyRequest}>
              Copy access request
            </button>
          )}
        </div>

        <details className="fb-support">
          <summary>For support</summary>
          <p>
            {pathname} needs one of: <code>{needed.join(', ') || 'none listed'}</code>.
            {' '}You hold: <code>{(user?.scopes || []).join(', ') || 'nothing'}</code>.
            {' '}Access is checked on every request; if it was granted a moment ago, reload the page.
          </p>
        </details>
      </section>
    </div>
  );
};

export default Forbidden;
