import React, { useEffect, useState, useCallback } from 'react';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
  getFeatures,
} from '../../services/adminService';
import { toast } from 'react-toastify';
import { STRINGS } from '../../constants';
import './Admin.css';

const s = STRINGS.pages.adminRoles;

// ── Create / Edit Role Modal ──────────────────────────────────
const RoleFormModal = ({ role, onClose, onDone }) => {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [isActive, setIsActive] = useState(role ? !!role.is_active : true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Role name is required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateRole(role.id, { name: name.trim(), description: description.trim(), is_active: isActive });
        toast.success(STRINGS.success?.ROLE_UPDATED || 'Role updated.');
      } else {
        await createRole(name.trim(), description.trim());
        toast.success(STRINGS.success?.ROLE_CREATED || 'Role created.');
      }
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save role.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? s.editTitle : s.createTitle}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {isEdit && role.is_system_role === 1 && (
            <div className="info-note">{s.systemRoleNote}</div>
          )}
          <div className="form-group">
            <label className="form-label">Role Name *</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={isEdit && role.is_system_role === 1}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={isEdit && role.is_system_role === 1}
            />
          </div>
          {isEdit && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="role-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={role.is_system_role === 1}
                style={{ accentColor: '#4299e1', width: 16, height: 16 }}
              />
              <label htmlFor="role-active" className="form-label" style={{ margin: 0 }}>
                Active
              </label>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || (isEdit && role.is_system_role === 1)}
          >
            {saving ? 'Saving…' : isEdit ? 'Update Role' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Edit Permissions Modal ────────────────────────────────────
const PermissionsModal = ({ role, onClose, onDone }) => {
  const [allFeatures, setAllFeatures] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState('ALL');

  useEffect(() => {
    Promise.all([getFeatures(), getRolePermissions(role.id)])
      .then(([featRes, permRes]) => {
        const feats = featRes.data?.data ?? featRes.data?.resource ?? featRes.data ?? [];
        const perms = permRes.data?.data ?? permRes.data?.resource ?? permRes.data ?? [];
        setAllFeatures(Array.isArray(feats) ? feats : []);
        setSelectedIds(perms.map((p) => p.feature_id));
      })
      .catch(() => toast.error('Failed to load permissions.'))
      .finally(() => setLoading(false));
  }, [role.id]);

  const toggle = (featureId) =>
    setSelectedIds((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId]
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRolePermissions(role.id, selectedIds);
      toast.success('Permissions updated.');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update permissions.');
    } finally {
      setSaving(false);
    }
  };

  const categories = ['ALL', ...new Set(allFeatures.map((f) => f.category).filter(Boolean))];
  const visibleFeatures =
    catFilter === 'ALL'
      ? allFeatures
      : allFeatures.filter((f) => f.category === catFilter);

  return (
    <div className="modal-backdrop">
      <div className="modal-panel modal-lg">
        <div className="modal-header">
          <h3 className="modal-title">{s.permissionsTitle} — {role.name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {role.is_system_role === 1 && (
            <div className="info-note">{s.systemRoleNote}</div>
          )}
          {loading ? (
            <p style={{ color: '#a0aec0', textAlign: 'center' }}>Loading…</p>
          ) : allFeatures.length === 0 ? (
            <p style={{ color: '#a0aec0' }}>{s.noFeatures}</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <select
                  className="admin-select"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>
                  ))}
                </select>
                <span style={{ marginLeft: 10, fontSize: '0.78rem', color: '#a0aec0' }}>
                  {selectedIds.length} selected
                </span>
              </div>
              <div className="feature-grid">
                {visibleFeatures.map((f) => {
                  const isSelected = selectedIds.includes(f.feature_id);
                  return (
                    <div
                      key={f.feature_id}
                      className={`feature-item${isSelected ? ' selected' : ''}`}
                      onClick={() => role.is_system_role !== 1 && toggle(f.feature_id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={role.is_system_role === 1}
                        onChange={() => toggle(f.feature_id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <p className="feature-name">{f.display_name || f.feature_short_name}</p>
                        <p className="feature-scope">{f.feature_short_name}:{f.scope}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || loading || role.is_system_role === 1}
          >
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Confirm Delete ────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose }) => (
  <div className="modal-backdrop">
    <div className="modal-panel">
      <div className="modal-header">
        <h3 className="modal-title">Delete Role</h3>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#4a5568' }}>{message}</p>
      </div>
      <div className="modal-footer">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────
const AdminRoles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [permTarget, setPermTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRoles();
      const data = res.data?.data ?? res.data?.resource ?? res.data ?? [];
      setRoles(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load roles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleDelete = async () => {
    try {
      await deleteRole(deleteTarget.id);
      toast.success(STRINGS.success?.ROLE_DELETED || 'Role deleted.');
      setDeleteTarget(null);
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete role.');
      setDeleteTarget(null);
    }
  };

  const handleModalDone = () => {
    setCreateOpen(false);
    setEditTarget(null);
    setPermTarget(null);
    fetchRoles();
  };

  const filtered = roles.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.name?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="admin-page-header">
        <h2 className="admin-page-title">{s.title}</h2>
        <div className="admin-action-row">
          <button className="btn-outline btn-sm" onClick={fetchRoles}>↻ Refresh</button>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            + New Role
          </button>
        </div>
      </div>

      <div className="admin-filter-bar">
        <input
          className="admin-search"
          placeholder="Search roles…"
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
                <th>Role Name</th>
                <th>Description</th>
                <th>Permissions</th>
                <th>Users</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    {r.is_system_role === 1 && (
                      <span className="badge badge-system" style={{ marginLeft: 6 }}>System</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.83rem', color: '#718096', maxWidth: 200 }}>
                    {r.description || '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.permission_count ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{r.user_count ?? '—'}</td>
                  <td>
                    <span className={`badge ${r.is_active ? 'badge-active' : 'badge-suspended'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        className="btn-outline btn-sm"
                        onClick={() => setPermTarget(r)}
                      >
                        Permissions
                      </button>
                      {r.is_system_role !== 1 && (
                        <>
                          <button
                            className="btn-outline btn-sm"
                            onClick={() => setEditTarget(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => setDeleteTarget(r)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <RoleFormModal role={null} onClose={() => setCreateOpen(false)} onDone={handleModalDone} />
      )}
      {editTarget && (
        <RoleFormModal role={editTarget} onClose={() => setEditTarget(null)} onDone={handleModalDone} />
      )}
      {permTarget && (
        <PermissionsModal role={permTarget} onClose={() => setPermTarget(null)} onDone={handleModalDone} />
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`Delete role "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
};

export default AdminRoles;
