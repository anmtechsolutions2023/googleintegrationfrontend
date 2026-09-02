import React, { useEffect, useState, useCallback } from 'react';
import {
  getOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
  reopenOnboardingRequest,
  getRoles,
} from '../../services/adminService';
import { toast } from 'react-toastify';
import { STRINGS } from '../../constants';
import './Admin.css';
import { grantableRoles } from '../../utils/roleLabels';

const s = STRINGS.pages.adminApprovals;

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

// ── Approve Modal ─────────────────────────────────────────────
const ApproveModal = ({ request, onClose, onDone }) => {
  const [tenantId, setTenantId] = useState('');
  const [roles, setRoles] = useState([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getRoles()
      .then((res) => {
        const data = res.data?.data ?? res.data?.resource ?? res.data ?? [];
        const active = Array.isArray(data)
          ? data.filter((r) => r.is_active !== false && r.is_active !== 0)
          : [];
        setRoles(active);
      })
      .catch(() => toast.error('Could not load available roles.'))
      .finally(() => setRolesLoading(false));
  }, []);

  const toggleRole = (id) =>
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );

  const generateTenantId = async () => {
    // Prefer the native crypto UUID; fall back to a manual v4 generator.
    const uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
    setTenantId(uuid);
    try {
      await navigator.clipboard.writeText(uuid);
      toast.success('Tenant ID generated and copied to clipboard.');
    } catch {
      toast.info('Tenant ID generated. Copy it manually if needed.');
    }
  };

  const handleApprove = async () => {
    if (!tenantId.trim()) {
      toast.error('Please enter a tenant ID.');
      return;
    }
    setSubmitting(true);
    try {
      await approveOnboardingRequest(request.id, tenantId.trim(), selectedRoleIds);
      toast.success(STRINGS.success?.ONBOARDING_APPROVED || 'User approved successfully.');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <h3 className="modal-title">{s.approveTitle}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: '#4a5568' }}>
            Approving access for <strong>{request.name}</strong> ({request.email}).
          </p>

          <div className="form-group">
            <label className="form-label">{s.tenantLabel} *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                className="form-input"
                placeholder={s.tenantPlaceholder}
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={generateTenantId}
                title="Generate a new GUID and copy it to the clipboard"
                style={{ whiteSpace: 'nowrap' }}
              >
                ⚡ Generate
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Assign Roles
              <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.8rem', color: '#a0aec0' }}>
                (optional — can be changed later in Users tab)
              </span>
            </label>
            {rolesLoading ? (
              <p style={{ fontSize: '0.85rem', color: '#a0aec0', margin: '6px 0' }}>Loading roles…</p>
            ) : grantableRoles(roles).length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#a0aec0', margin: '6px 0' }}>
                No roles available. Create roles in the Roles tab first.
              </p>
            ) : (
              <div className="roles-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {grantableRoles(roles).map((role) => {
                  const isSelected = selectedRoleIds.includes(role.id);
                  return (
                    <div
                      key={role.id}
                      className={`role-check-item${isSelected ? ' selected' : ''}`}
                      onClick={() => toggleRole(role.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRole(role.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <p className="role-check-name">{role.name}</p>
                        {role.description && (
                          <p className="role-check-desc">{role.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedRoleIds.length > 0 && (
              <p style={{ marginTop: 4, fontSize: '0.78rem', color: '#4299e1' }}>
                {selectedRoleIds.length} role{selectedRoleIds.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {request.request_note && (
            <div className="info-note">
              <strong>Applicant note:</strong> {request.request_note}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleApprove}
            disabled={submitting || !tenantId.trim()}
          >
            {submitting ? 'Approving…' : 'Approve & Provision'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Reject Modal ──────────────────────────────────────────────
const RejectModal = ({ request, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await rejectOnboardingRequest(request.id, reason.trim());
      toast.success(STRINGS.success?.ONBOARDING_REJECTED || 'Request rejected.');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <h3 className="modal-title">{s.rejectTitle}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: '#4a5568' }}>
            Rejecting access for <strong>{request.name}</strong> ({request.email}).
          </p>
          <div className="form-group">
            <label className="form-label">{s.rejectReasonLabel}</label>
            <textarea
              className="form-textarea"
              placeholder={s.rejectReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn-danger"
            onClick={handleReject}
            disabled={submitting}
          >
            {submitting ? 'Rejecting…' : 'Reject Request'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
const AdminApprovals = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reopeningId, setReopeningId] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      // Always send the status explicitly — the backend defaults a missing
      // status to PENDING, so 'ALL' must be passed as an explicit value.
      const res = await getOnboardingRequests({ status: filter });
      const data = res.data?.data ?? res.data?.resource ?? res.data ?? [];
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load onboarding requests.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleModalDone = () => {
    setApproveTarget(null);
    setRejectTarget(null);
    fetchRequests();
  };

  const handleReopen = async (request) => {
    setReopeningId(request.id);
    try {
      await reopenOnboardingRequest(request.id);
      toast.success(STRINGS.success?.ONBOARDING_REOPENED || 'Request reopened for review.');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reopen request.');
    } finally {
      setReopeningId(null);
    }
  };

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.email?.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q)
    );
  });

  const statusBadge = (status) => {
    const cls = {
      PENDING: 'badge-pending',
      APPROVED: 'badge-approved',
      REJECTED: 'badge-rejected',
      CANCELLED: 'badge-cancelled',
    }[status] || 'badge-cancelled';
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  return (
    <>
      <div className="admin-page-header">
        <h2 className="admin-page-title">{s.title}</h2>
        <div className="admin-action-row">
          <button className="btn-outline btn-sm" onClick={fetchRequests}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="admin-filter-bar">
        <input
          className="admin-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>{o === 'ALL' ? 'All Statuses' : o}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="admin-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">{s.empty}</div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: '#718096', fontSize: '0.85rem' }}>{r.email}</td>
                  <td>
                    {statusBadge(r.status)}
                    {r.reviewed_by === 'system-auto' && (
                      <span
                        className="badge badge-auto"
                        title="Auto-approved by the system (auto-approval is enabled)"
                        style={{ marginLeft: 6 }}
                      >
                        ⚡ Auto
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#a0aec0', whiteSpace: 'nowrap' }}>
                    {r.requested_at
                      ? new Date(r.requested_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td style={{ maxWidth: 180, fontSize: '0.82rem', color: '#4a5568' }}>
                    {r.request_note || '—'}
                  </td>
                  <td>
                    {r.status === 'PENDING' && (
                      <div className="cell-actions">
                        <button
                          className="btn-success btn-sm"
                          onClick={() => setApproveTarget(r)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => setRejectTarget(r)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {r.status === 'REJECTED' && (
                      <div className="cell-actions">
                        <button
                          className="btn-outline btn-sm"
                          onClick={() => handleReopen(r)}
                          disabled={reopeningId === r.id}
                          title="Return this request to Pending for another review"
                        >
                          {reopeningId === r.id ? 'Reopening…' : '↺ Reopen'}
                        </button>
                        {r.reviewed_by && (
                          <span style={{ fontSize: '0.78rem', color: '#a0aec0', alignSelf: 'center' }}>
                            by {r.reviewed_by}
                          </span>
                        )}
                      </div>
                    )}
                    {r.status !== 'PENDING' && r.status !== 'REJECTED' && (
                      <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>
                        {r.reviewed_by ? `by ${r.reviewed_by}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={handleModalDone}
        />
      )}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={handleModalDone}
        />
      )}
    </>
  );
};

export default AdminApprovals;
