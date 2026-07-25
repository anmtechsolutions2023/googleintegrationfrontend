import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { getAppConfig, updateAppConfig } from '../../services/adminService';
import './Admin.css';

// Super-admin only. Global, system-wide application settings.
const AdminAppConfig = () => {
  const [config, setConfig] = useState({ autoApproveOnboarding: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAppConfig();
      const data = res.data?.data ?? res.data ?? {};
      setConfig({ autoApproveOnboarding: Boolean(data.autoApproveOnboarding) });
    } catch {
      toast.error('Could not load application configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAutoApprove = async (e) => {
    const next = e.target.checked;
    // Optimistic update, revert on failure.
    const prev = config.autoApproveOnboarding;
    setConfig({ autoApproveOnboarding: next });
    setSaving(true);
    try {
      const res = await updateAppConfig({ autoApproveOnboarding: next });
      const data = res.data?.data ?? res.data ?? {};
      setConfig({ autoApproveOnboarding: Boolean(data.autoApproveOnboarding) });
      toast.success(
        next
          ? 'Onboarding auto-approval enabled.'
          : 'Onboarding auto-approval disabled.'
      );
    } catch (err) {
      setConfig({ autoApproveOnboarding: prev });
      toast.error(err.response?.data?.message || 'Failed to update configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2>Application Configuration</h2>
        <p style={{ color: '#718096', fontSize: '0.88rem', margin: '4px 0 0' }}>
          System-wide settings. Changes take effect immediately.
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#a0aec0' }}>Loading configuration…</p>
      ) : (
        <div className="appconfig-card">
          <div className="appconfig-copy">
            <h3>Auto-approve new onboarding requests</h3>
            <p>
              When enabled, a brand-new person signing in is provisioned
              automatically into their own new tenant as its Tenant Admin —
              skipping the manual Approvals queue. When disabled, new sign-ins
              wait in Approvals for manual review.
            </p>
          </div>
          <label className="appconfig-switch" title="Toggle onboarding auto-approval">
            <input
              type="checkbox"
              checked={config.autoApproveOnboarding}
              onChange={toggleAutoApprove}
              disabled={saving}
              aria-label="Auto-approve new onboarding requests"
            />
            <span className="appconfig-slider" />
          </label>
        </div>
      )}
    </div>
  );
};

export default AdminAppConfig;
