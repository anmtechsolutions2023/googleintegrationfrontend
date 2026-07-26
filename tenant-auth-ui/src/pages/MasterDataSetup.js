import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { bootstrapMasterData } from '../services/masterSetupService';
import { useAuth } from '../context/AuthContext';
import { isSetupPending } from '../utils/permissions';
import { ROUTES } from '../constants/routes';
import './MasterDataSetup.css';

// ── Declarative step / group / field definitions ─────────────────────────────
// Each field's `path` addresses a node in the nested payload; the orchestrator
// on the backend resolves all foreign keys, so the client never sends ids.
const NUMBER_FIELDS = new Set(['Lat', 'Lng', 'Amount', 'StartCounterNo']);

const STEPS = [
  {
    key: 'organization',
    title: 'Organization',
    groups: [
      { title: 'Organization', path: 'organization', fields: [
        { name: 'Name', label: 'Organization Name', required: true },
      ] },
    ],
  },
  {
    key: 'branch',
    title: 'Branch',
    groups: [
      { title: 'Branch', path: 'branch', fields: [
        { name: 'Name', label: 'Branch Name', required: true },
      ] },
      { title: 'Address', path: 'branch.address', fields: [
        { name: 'AddressLine1', label: 'Address Line 1', required: true },
        // Address tag is fixed for onboarding — hidden from the UI, sent to the API.
        { name: 'TagName', label: 'Address Tag', required: true, hidden: true, value: 'Onboarding' },
        { name: 'City' }, { name: 'State' }, { name: 'Pincode' },
        // Address Type is fixed to 'Onboarding' for onboarding — hidden from the UI,
        // sent to the API (backend reuses the existing type or creates it).
        { name: 'Name', label: 'Address Type', required: true, hidden: true, value: 'Onboarding', path: 'branch.address.contactAddressType' },
      ] },
      { title: 'Contact', path: 'branch.contact', fields: [
        { name: 'FirstName', label: 'First Name', required: true },
        { name: 'LastName', label: 'Last Name', required: true },
        { name: 'Email' },
      ] },
      { title: 'Transaction Type Config', path: 'branch.transactionTypeConfig', fields: [
        { name: 'StartCounterNo', label: 'Start Counter No', type: 'number', required: true },
        { name: 'Format', label: 'Format', required: true, hint: 'e.g. INV-{0000}' },
        // Config tag is fixed for onboarding — hidden from the UI, sent to the API.
        { name: 'TagName', label: 'Config Tag', required: true, hidden: true, value: 'Onboarding' },
      ] },
    ],
  },
  {
    key: 'item',
    title: 'Item',
    optional: true,
    groups: [
      { title: 'Item', path: 'item', fields: [
        { name: 'Name', label: 'Item Name', required: true },
        { name: 'Code' },
      ] },
      { title: 'Category', path: 'item.category', fields: [
        { name: 'Name', label: 'Category Name', required: true, hint: 'e.g. Starter, Main course' },
      ] },
      // Unit of Measure is fixed to 'Primary' for onboarding — hidden from the UI,
      // sent to the API. The whole section is skipped since its only field is hidden.
      { title: 'Unit of Measure', path: 'item.uom', fields: [
        { name: 'UnitName', label: 'Unit Name', required: true, hidden: true, value: 'Primary' },
      ] },
      { title: 'Cost Info', path: 'item.costInfo', fields: [
        { name: 'Amount', label: 'Amount', type: 'number', required: true },
      ] },
      { title: 'Tax Group', path: 'item.costInfo.taxGroup', fields: [
        { name: 'Name', label: 'Tax Group Name', required: true, hint: 'e.g. GST5' },
      ] },
    ],
  },
  { key: 'review', title: 'Review' },
];

// ── Small immutable helpers for nested path get/set ──────────────────────────
const getVal = (obj, path, name) => {
  const node = path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
  return (node && node[name] !== undefined) ? node[name] : '';
};

const setVal = (obj, path, name, value) => {
  const next = JSON.parse(JSON.stringify(obj || {}));
  let cursor = next;
  path.split('.').forEach((k) => {
    cursor[k] = cursor[k] ? { ...cursor[k] } : {};
    cursor = cursor[k];
  });
  cursor[name] = value;
  return next;
};

const MasterDataSetup = () => {
  const { user, applyToken } = useAuth() || {};
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState({});
  const [includeItem, setIncludeItem] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  // The wizard runs once per tenant. A user who returns here by direct URL after
  // completing it is sent to the dashboard; the backend also answers 409, so
  // this is convenience rather than the actual enforcement.
  const setupPending = isSetupPending(user);
  const alreadyDone = user?.setupCompleted !== false;

  const step = STEPS[stepIdx];
  const isItemStep = step.key === 'item';
  const isReview = step.key === 'review';
  const itemActive = !isItemStep || includeItem;

  // Required fields missing on the current step (skipped when item is disabled).
  const missing = useMemo(() => {
    if (isReview || (isItemStep && !includeItem)) return [];
    const out = [];
    step.groups?.forEach((g) => g.fields.forEach((f) => {
      if (f.hidden) return; // hidden fields carry a hardcoded value — never "missing"
      const fp = f.path || g.path;
      if (f.required && String(getVal(form, fp, f.name)).trim() === '') {
        out.push(`${fp}.${f.name}`);
      }
    }));
    return out;
  }, [form, step, isReview, isItemStep, includeItem]);

  const update = (path, name, value) => setForm((prev) => setVal(prev, path, name, value));

  const goNext = () => {
    if (missing.length > 0) { setShowErrors(true); return; }
    setShowErrors(false);
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const goBack = () => { setShowErrors(false); setStepIdx((i) => Math.max(i - 1, 0)); };

  // Coerce number-typed fields and drop empty optional values before sending.
  const buildPayload = () => {
    // Seed hidden/constant fields (e.g. the hardcoded 'Onboarding' tags) into the
    // tree so they reach the API even though they're never rendered as inputs.
    let seeded = form;
    STEPS.forEach((s) => s.groups?.forEach((g) => g.fields.forEach((f) => {
      if (f.value !== undefined) seeded = setVal(seeded, f.path || g.path, f.name, f.value);
    })));
    const clean = (node) => {
      const out = {};
      Object.entries(node).forEach(([k, v]) => {
        if (v && typeof v === 'object') { out[k] = clean(v); return; }
        if (String(v).trim() === '') return;
        out[k] = NUMBER_FIELDS.has(k) ? Number(v) : v;
      });
      return out;
    };
    const payload = { organization: clean(seeded.organization || {}), branch: clean(seeded.branch || {}) };
    if (includeItem && seeded.item) payload.item = clean(seeded.item);
    return payload;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await bootstrapMasterData(buildPayload());
      const { setupToken, ...ids } = res.data?.data ?? res.data ?? {};

      // Swap in the refreshed token BEFORE anything navigates. The token in hand
      // still says setupCompleted:false, so without this the route guard would
      // bounce the user straight back into the wizard they just finished.
      if (setupToken) applyToken(setupToken);

      setResult(ids);
      toast.success('Master data created successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create master data. Nothing was saved.');
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyDone && !result) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mds-wrap">
        <div className="mds-card mds-success">
          <div className="mds-success-icon">✓</div>
          <h2>Tenancy setup complete</h2>
          <p>
            Everything below was created in a single transaction. The rest of the
            application is now unlocked, and this wizard will not be shown again.
          </p>
          <ReviewPanel form={form} includeItem={includeItem} />
          {/* No "set up another": the wizard runs once per tenant and the API
              answers 409 on a second attempt. */}
          <button className="mds-btn mds-btn-primary" onClick={() => navigate(ROUTES.DASHBOARD)}>
            Continue to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mds-wrap">
      <header className="mds-header">
        <h1>Master Data Setup</h1>
        <p>Create your Organization, Branch and first Item together. It's all-or-nothing — if anything fails, nothing is saved.</p>
      </header>

      {/* Why the rest of the menu is missing. Without this the collapsed
          navigation just reads as a broken app. Not dismissible — there is
          genuinely nothing else the user can do yet. */}
      {setupPending && (
        <div className="mds-gate-banner" role="alert">
          <strong>Finish this setup to unlock the application.</strong>
          <span>
            Until your organization and branch exist, the only pages available are
            Home, Audit Logs and signing out.
          </span>
        </div>
      )}

      {/* Stepper */}
      <ol className="mds-stepper" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`mds-step ${i === stepIdx ? 'is-active' : ''} ${i < stepIdx ? 'is-done' : ''}`}
          >
            <span className="mds-step-num">{i < stepIdx ? '✓' : i + 1}</span>
            <span className="mds-step-label">{s.title}{s.optional ? ' (optional)' : ''}</span>
          </li>
        ))}
      </ol>

      <div className="mds-card">
        {isReview ? (
          <ReviewPanel form={form} includeItem={includeItem} />
        ) : (
          <>
            {isItemStep && (
              <label className="mds-toggle">
                <input type="checkbox" checked={includeItem} onChange={(e) => setIncludeItem(e.target.checked)} />
                <span>Add a starter item now (you can also add items later)</span>
              </label>
            )}
            {itemActive && step.groups.filter((g) => g.fields.some((f) => !f.hidden)).map((g) => (
              <fieldset className="mds-group" key={g.path + g.title}>
                <legend>{g.title}</legend>
                <div className="mds-grid">
                  {g.fields.filter((f) => !f.hidden).map((f) => {
                    const fp = f.path || g.path;
                    const id = `${fp}.${f.name}`;
                    const invalid = showErrors && missing.includes(id);
                    return (
                      <div className={`mds-field ${invalid ? 'is-invalid' : ''}`} key={id}>
                        <label htmlFor={id}>
                          {f.label || f.name}{f.required && <span className="mds-req">*</span>}
                        </label>
                        <input
                          id={id}
                          type={f.type === 'number' ? 'number' : 'text'}
                          step={f.type === 'number' ? 'any' : undefined}
                          value={getVal(form, fp, f.name)}
                          onChange={(e) => update(fp, f.name, e.target.value)}
                        />
                        {f.hint && <small className="mds-hint">{f.hint}</small>}
                        {invalid && <small className="mds-error">Required</small>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {isItemStep && !includeItem && (
              <p className="mds-skip-note">Item creation skipped — only the Organization and Branch will be created.</p>
            )}
          </>
        )}
      </div>

      <div className="mds-actions">
        <button className="mds-btn mds-btn-ghost" onClick={goBack} disabled={stepIdx === 0 || submitting}>
          Back
        </button>
        {isReview ? (
          <button className="mds-btn mds-btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create everything'}
          </button>
        ) : (
          <button className="mds-btn mds-btn-primary" onClick={goNext} disabled={submitting}>
            Next
          </button>
        )}
      </div>
    </div>
  );
};

// ── Review summary ───────────────────────────────────────────────────────────
const ReviewPanel = ({ form, includeItem }) => {
  const rows = [];
  const push = (label, node, keys) => {
    const vals = keys.map((k) => node?.[k]).filter((v) => v !== undefined && String(v).trim() !== '');
    if (vals.length) rows.push({ label, value: vals.join(' · ') });
  };
  push('Organization', form.organization, ['Name']);
  push('Branch', form.branch, ['Name']);
  push('Address', form.branch?.address, ['AddressLine1', 'City', 'State', 'Pincode']);
  push('Address Type', form.branch?.address?.contactAddressType, ['Name']);
  push('Contact', form.branch?.contact, ['FirstName', 'LastName', 'Email']);
  push('Txn Config', form.branch?.transactionTypeConfig, ['Format', 'StartCounterNo']);
  if (includeItem) {
    push('Item', form.item, ['Name', 'Code']);
    push('Category', form.item?.category, ['Name']);
    push('Unit', form.item?.uom, ['UnitName']);
    push('Cost', form.item?.costInfo, ['Amount']);
    push('Tax Group', form.item?.costInfo?.taxGroup, ['Name']);
  }
  return (
    <div className="mds-review">
      <h3>Review &amp; confirm</h3>
      <dl className="mds-review-list">
        {rows.map((r) => (
          <div className="mds-review-row" key={r.label}>
            <dt>{r.label}</dt><dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default MasterDataSetup;
