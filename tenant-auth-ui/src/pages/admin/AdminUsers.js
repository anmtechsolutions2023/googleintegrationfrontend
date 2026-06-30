import React, { useEffect, useState, useCallback } from 'react';
import {
  getAdminUsers,
  getRoles,
  getUserRoles,
  updateUserRoles,
  updateUserStatus,
  deleteUser,
} from '../../services/adminService';
import { toast } from 'react-toastify';
import { STRINGS } from '../../constants';
import './Admin.css';

const s = STRINGS.pages.adminUsers;

// ── Edit Roles Modal ───────────────────────────────────────────
const EditRolesModal = ({ user, allRoles, onClose, onDone }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserRoles(user.user_email)
      .then((res) => {
        const rows = res.data?.data ?? res.data?.resource ?? res.data ?? [];
        setSelectedIds(rows.map((r) => r.role_id));
      })
      .catch(() => toast.error('Failed to load user roles.'))
      .finally(() => setLoading(false));
  }, [user.user_email]);

  const toggle = (roleId) =>
    setSelectedIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserRoles(user.user_email, selectedIds);
      toast.success(STRINGS.success?.USER_ROLES_UPDATED || 'Roles updated.');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update roles.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <h3 className="modal-title">{s.rolesTitle}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontSize: '0.88rem', color: '#4a5568' }}>
            Editing roles for <strong>{user.user_email}</strong>
          </p>
          {loading ? (
            <p style={{ color: '#a0aec0', textAlign: 'center', padding: '20px 0' }}>Loading…</p>
          ) : allRoles.length === 0 ? (
            <p style={{ color: '#a0aec0' }}>No roles available in this tenant.</p>
          ) : (
            <div className="roles-list">
              {allRoles.map((role) => {
                const isSelected = selectedIds.includes(role.id);
                return (
                  <div
                    key={role.id}
                    className={`role-check-item${isSelected ? ' selected' : ''}`}
                    onClick={() => toggle(role.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(role.id)}
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
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Roles'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Confirm Modal ──────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose, danger }) => (
  <div className="modal-backdrop">
    <div className="modal-panel">
      <div className="modal-header">
        <h3 className="modal-title">Confirm</h3>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#4a5568' }}>{message}</p>
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

// ── Main Component ─────────────────────────────────────────────
const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rolesTarget, setRolesTarget] = useState(null);
  const [confirmData, setConfirmData] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([getAdminUsers(), getRoles()]);
      const uList = usersRes.data?.data ?? usersRes.data?.resource ?? usersRes.data ?? [];
      const rList = rolesRes.data?.data ?? rolesRes.data?.resource ?? rolesRes.data ?? [];
      setUsers(Array.isArray(uList) ? uList : []);
      setAllRoles(Array.isArray(rList) ? rList : []);
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
    setConfirmData({
      message: nextActive ? s.confirmActivate : s.confirmSuspend,
      danger: !nextActive,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          await updateUserStatus(u.user_email, nextStatus);
          toast.success(STRINGS.success?.USER_STATUS_UPDATED || 'Status updated.');
          fetchAll();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to update status.');
        }
      },
    });
  };

  const handleDelete = (u) => {
    setConfirmData({
      message: `${s.confirmDelete}\n\n${u.user_email}`,
      danger: true,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          await deleteUser(u.user_email);
          toast.success(STRINGS.success?.USER_REMOVED || 'User removed.');
          fetchAll();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to remove user.');
        }
      },
    });
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.user_email?.toLowerCase().includes(q) || u.roles?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="admin-page-header">
        <h2 className="admin-page-title">{s.title}</h2>
        <div className="admin-action-row">
          <button className="btn-outline btn-sm" onClick={fetchAll}>↻ Refresh</button>
        </div>
      </div>

      <div className="admin-filter-bar">
        <input
          className="admin-search"
          placeholder="Search by email or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                <th>Email</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.user_email}>
                  <td style={{ fontWeight: 500 }}>{u.user_email}</td>
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
                    {u.is_super_admin ? (
                      <span className="badge badge-system">Super Admin</span>
                    ) : null}
                    {!u.is_admin && !u.is_super_admin ? (
                      <span style={{ color: '#a0aec0' }}>—</span>
                    ) : null}
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        className="btn-outline btn-sm"
                        onClick={() => setRolesTarget(u)}
                      >
                        Roles
                      </button>
                      <button
                        className={`btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggleStatus(u)}
                      >
                        {u.is_active ? 'Suspend' : 'Activate'}
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleDelete(u)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rolesTarget && (
        <EditRolesModal
          user={rolesTarget}
          allRoles={allRoles}
          onClose={() => setRolesTarget(null)}
          onDone={() => { setRolesTarget(null); fetchAll(); }}
        />
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

export default AdminUsers;
