import React, { useEffect, useState, useCallback } from 'react';
import { getFeatures, createFeature, updateFeature, deleteFeature } from '../../services/adminService';
import { toast } from 'react-toastify';
import { STRINGS } from '../../constants';
import './Admin.css';

const s = STRINGS.pages.adminFeatures;

// ── Create / Edit Feature Modal ───────────────────────────────
const FeatureFormModal = ({ feature, onClose, onDone }) => {
  const isEdit = !!feature;
  const [form, setForm] = useState({
    feature_name:       feature?.feature_name       || '',
    feature_short_name: feature?.feature_short_name || '',
    scope:              feature?.scope              || '',
    display_name:       feature?.display_name       || '',
    category:           feature?.category           || '',
    description:        feature?.description        || '',
    is_active:          feature ? feature.is_active !== false && feature.is_active !== 0 : true,
  });
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) =>
    setForm((prev) => ({
      ...prev,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const handleSave = async () => {
    if (!form.feature_short_name.trim() || !form.scope.trim()) {
      toast.error('Short Name and Scope are required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateFeature(feature.feature_id, {
          displayName: form.display_name.trim(),
          scope:       form.scope.trim(),
          category:    form.category.trim(),
          description: form.description.trim(),
          isActive:    form.is_active,
        });
        toast.success(STRINGS.success?.FEATURE_UPDATED || 'Feature updated.');
      } else {
        await createFeature({
          featureName:      form.feature_name.trim(),
          featureShortName: form.feature_short_name.trim().toUpperCase(),
          scope:            form.scope.trim(),
          displayName:      form.display_name.trim(),
          category:         form.category.trim(),
          description:      form.description.trim(),
        });
        toast.success(STRINGS.success?.FEATURE_CREATED || 'Feature created.');
      }
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save feature.');
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
          {!isEdit && (
            <>
              <div className="form-group">
                <label className="form-label">Feature Name * <span style={{ color: '#a0aec0', fontWeight: 400 }}>(internal)</span></label>
                <input className="form-input" value={form.feature_name} onChange={set('feature_name')} maxLength={100} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Short Name * <span style={{ color: '#a0aec0', fontWeight: 400 }}>(e.g. INVENTORY)</span></label>
                <input
                  className="form-input"
                  value={form.feature_short_name}
                  onChange={set('feature_short_name')}
                  maxLength={50}
                  placeholder="UPPERCASE identifier"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Scope * <span style={{ color: '#a0aec0', fontWeight: 400 }}>(e.g. READ, WRITE)</span></label>
            <input className="form-input" value={form.scope} onChange={set('scope')} maxLength={50} />
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" value={form.display_name} onChange={set('display_name')} maxLength={100} placeholder="Human-readable name" />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <input className="form-input" value={form.category} onChange={set('category')} maxLength={50} placeholder="e.g. Inventory, Payments" />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description} onChange={set('description')} rows={3} maxLength={500} />
          </div>

          {isEdit && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="feat-active"
                checked={form.is_active}
                onChange={set('is_active')}
                style={{ accentColor: '#4299e1', width: 16, height: 16 }}
              />
              <label htmlFor="feat-active" className="form-label" style={{ margin: 0 }}>Active</label>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update Feature' : 'Create Feature'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
const AdminFeatures = () => {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFeatures();
      const data = res.data?.data ?? res.data?.resource ?? res.data ?? [];
      setFeatures(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load features.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const handleModalDone = () => {
    setCreateOpen(false);
    setEditTarget(null);
    fetchFeatures();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFeature(deleteTarget.feature_id);
      toast.success('Feature deleted.');
      setDeleteTarget(null);
      fetchFeatures();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete feature.');
    } finally {
      setDeleting(false);
    }
  };

  const categories = ['ALL', ...new Set(features.map((f) => f.category).filter(Boolean))];

  const filtered = features.filter((f) => {
    const matchesCat = catFilter === 'ALL' || f.category === catFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      f.feature_name?.toLowerCase().includes(q) ||
      f.feature_short_name?.toLowerCase().includes(q) ||
      f.scope?.toLowerCase().includes(q) ||
      f.display_name?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <>
      <div className="admin-page-header">
        <h2 className="admin-page-title">{s.title}</h2>
        <div className="admin-action-row">
          <button className="btn-outline btn-sm" onClick={fetchFeatures}>↻ Refresh</button>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            + New Feature
          </button>
        </div>
      </div>

      <div className="admin-filter-bar">
        <input
          className="admin-search"
          placeholder="Search features…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>
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
                <th>Display Name</th>
                <th>Short Name</th>
                <th>Scope</th>
                <th>Category</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.feature_id}>
                  <td style={{ fontWeight: 500 }}>
                    {f.display_name || f.feature_name}
                    {f.description && (
                      <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#a0aec0' }}>
                        {f.description}
                      </p>
                    )}
                  </td>
                  <td>
                    <code style={{ background: '#edf2f7', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>
                      {f.feature_short_name}
                    </code>
                  </td>
                  <td>
                    <span className="badge badge-system">{f.scope}</span>
                  </td>
                  <td style={{ fontSize: '0.83rem', color: '#718096' }}>{f.category || '—'}</td>
                  <td>
                    <span className={`badge ${f.is_active ? 'badge-active' : 'badge-suspended'}`}>
                      {f.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-outline btn-sm"
                      onClick={() => setEditTarget(f)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setDeleteTarget(f)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <FeatureFormModal feature={null} onClose={() => setCreateOpen(false)} onDone={handleModalDone} />
      )}
      {editTarget && (
        <FeatureFormModal feature={editTarget} onClose={() => setEditTarget(null)} onDone={handleModalDone} />
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Delete Feature</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                Delete <strong>{deleteTarget.display_name || deleteTarget.feature_name}</strong>?
                This will fail if the feature is currently assigned to any role.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminFeatures;
