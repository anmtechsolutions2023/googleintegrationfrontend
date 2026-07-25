import React, { useEffect, useState, useCallback } from 'react';
import {
  getAllAdminUsers,
  updateUserStatusCrossTenant,
} from '../../services/adminService';
import { toast } from 'react-toastify';
import './Admin.css';

// ── Confirm Modal ──────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose, danger }) => (
  <div className="modal-backdrop">
    <div className="modal-panel">
      <div className="modal-header">
        <h3 className="modal-title">Confirm</h3>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#4a5568', whiteSpace: 'pre-line' }}>{message}</p>
      </div>
      <div className="modal-footer">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </div>
  </div>
);

// ── Super-admin-only cross-tenant user listing ─────────────────────────
// The per-tenant Users page (AdminUsers) is scoped to the caller's tenant. This
// page lists members of every tenant so a super admin can see all users and
// suspend/activate any of them. Suspending sets is_active = 0, which blocks the
// user's login. Super-admin rows expose no action (matches the backend guard).
const AdminAllUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllAdminUsers();
      const list = res.data?.data ?? res.data?.resource ?? res.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggleStatus = (u) => {
    const nextActive = !u.is_active;
    const nextStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';
    const tenantLabel = u.tenant_name || u.tenant_id;
    setConfirmData({
      message: nextActive
        ? `Activate ${u.user_email} in "${tenantLabel}"?\n\nThey will be able to log in again.`
        : `Suspend ${u.user_email} in "${tenantLabel}"?\n\nThey will be blocked from logging in until re-activated.`,
      danger: !nextActive,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          await updateUserStatusCrossTenant(u.user_email, u.tenant_id, nextStatus);
          toast.success('Status updated.');
          fetchAll();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to update status.');
        }
      },
    });
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.user_email?.toLowerCase().includes(q) ||
      u.roles?.toLowerCase().includes(q) ||
      u.tenant_name?.toLowerCase().includes(q) ||
      u.tenant_id?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="admin-page-header">
        <h2 className="admin-page-title">All Users</h2>
        <div className="admin-action-row">
          <button className="btn-outline btn-sm" onClick={fetchAll}>↻ Refresh</button>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#718096' }}>
        Every user across all tenants. Suspending a user blocks their login until
        you re-activate them. Super admins cannot be suspended here.
      </p>

      <div className="admin-filter-bar">
        <input
          className="admin-search"
          placeholder="Search by email, role, or tenant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="admin-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">No users found.</div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSuper = !!u.is_super_admin;
                return (
                  <tr key={`${u.tenant_id}:${u.user_email}`}>
                    <td style={{ fontWeight: 500 }}>{u.user_email}</td>
                    <td style={{ fontSize: '0.82rem', color: '#4a5568' }}>
                      {u.tenant_name || (
                        <span style={{ color: '#a0aec0' }}>—</span>
                      )}
                      <div style={{ fontSize: '0.68rem', color: '#a0aec0' }}>
                        {u.tenant_id}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${u.is_active ? 'badge-active' : 'badge-suspended'}`}
                      >
                        {u.status || (u.is_active ? 'ACTIVE' : 'SUSPENDED')}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#4a5568' }}>
                      {u.roles || <span style={{ color: '#a0aec0' }}>None</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {u.is_admin ? (
                        <span className="badge badge-system" style={{ marginRight: 4 }}>Admin</span>
                      ) : null}
                      {isSuper ? (
                        <span className="badge badge-system">Super Admin</span>
                      ) : null}
                      {!u.is_admin && !isSuper ? (
                        <span style={{ color: '#a0aec0' }}>—</span>
                      ) : null}
                    </td>
                    <td>
                      {isSuper ? (
                        <span style={{ color: '#a0aec0', fontSize: '0.78rem' }}>Protected</span>
                      ) : (
                        <div className="cell-actions">
                          <button
                            className={`btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => handleToggleStatus(u)}
                          >
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmData && (
        <ConfirmModal
          message={confirmData.message}
          danger={confirmData.danger}
          onConfirm={confirmData.onConfirm}
          onClose={() => setConfirmData(null)}
        />
      )}
    </>
  );
};

export default AdminAllUsers;
