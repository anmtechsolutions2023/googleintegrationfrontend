import React, { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { bootstrapMasterData } from '../services/masterSetupService';
import importService from '../services/importService';
import { toCsv } from '../utils/csv';
import { COLUMNS, TEMPLATE_ROWS, DEFAULT_TAX, checkFile, download } from '../utils/itemImport';
import { useAuth } from '../context/AuthContext';
import { isSetupPending } from '../utils/permissions';
import { ROUTES } from '../constants/routes';
import './MasterDataSetup.css';

// ── Declarative step / group / field definitions ─────────────────────────────
// Each field's `path` addresses a node in the nested payload; the orchestrator
// on the backend resolves all foreign keys, so the client never sends ids.
const NUMBER_FIELDS = new Set(['Lat', 'Lng', 'Amount']);

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
      // Transaction Type Config is deliberately absent. A numbering series is
      // still created for every branch — branchdetail.TransactionTypeConfigId is
      // a NOT NULL foreign key, so one has to exist — but the API decides it
      // (INV-0001 onward, tagged 'Onboarding'). "Where should your invoice
      // numbers start" is not a question a new tenant can answer, and it was the
      // last thing standing between them and a working branch. Changing the
      // series afterwards belongs on a settings screen, not in signup.
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
        { name: 'Name', label: 'Tax Group Name', required: true, hint: 'A label — the rates below are what gets charged' },
      ] },
    ],
  },
  { key: 'review', title: 'Review' },
];

// Where the starter items come from. Two genuinely different acts: one item
// typed by hand, created inside the same transaction as the branch; or a list,
// which cannot be created until that transaction has committed.
const SOURCE = { SINGLE: 'single', FILE: 'file' };

// The rates a typed tax group starts with.
//
// A tax group is a CONTAINER — the rates live in the tax types mapped into it,
// and a group with none prices at 0%. Typing "GST 18%" and nothing else is what
// produced a starter item that billed no tax at all, on every bill, silently.
// So the form starts from the standard intra-state split rather than empty.
const DEFAULT_RATES = DEFAULT_TAX.split('|').map((part) => {
  const [Name, Value] = part.split(':');
  return { Name, Value };
});

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

const rateTotal = (rates) => rates.reduce((sum, r) => {
  const n = Number(r.Value);
  return sum + (Number.isNaN(n) ? 0 : n);
}, 0);

const MasterDataSetup = () => {
  const { user, applyToken } = useAuth() || {};
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState({});
  const [includeItem, setIncludeItem] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  const [itemSource, setItemSource] = useState(SOURCE.SINGLE);
  const [taxRates, setTaxRates] = useState(DEFAULT_RATES);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [publishToBranch, setPublishToBranch] = useState(true);
  const [showAllRows, setShowAllRows] = useState(false);
  const fileRef = useRef(null);

  // What actually happened, reported separately for each pass — see submit().
  const [phase, setPhase] = useState(null);

  // The wizard runs once per tenant. A user who returns here by direct URL after
  // completing it is sent to the dashboard; the backend also answers 409, so
  // this is convenience rather than the actual enforcement.
  const setupPending = isSetupPending(user);
  const alreadyDone = user?.setupCompleted !== false;

  const step = STEPS[stepIdx];
  const isItemStep = step.key === 'item';
  const isReview = step.key === 'review';
  const typingItem = includeItem && itemSource === SOURCE.SINGLE;
  const uploadingItems = includeItem && itemSource === SOURCE.FILE;
  // Memoised: it feeds a useMemo below, and a fresh [] each render would
  // recompute canAdvance on every keystroke.
  const importRows = useMemo(() => parsed?.valid || [], [parsed]);

  // Required fields missing on the current step.
  //
  // Skipped entirely when the item step is off, and when the items are coming
  // from a file — the typed fields describe ONE item, and a file describes its
  // own.
  const missing = useMemo(() => {
    if (isReview) return [];
    if (isItemStep && !typingItem) return [];
    const out = [];
    step.groups?.forEach((g) => g.fields.forEach((f) => {
      if (f.hidden) return; // hidden fields carry a hardcoded value — never "missing"
      const fp = f.path || g.path;
      if (f.required && String(getVal(form, fp, f.name)).trim() === '') {
        out.push(`${fp}.${f.name}`);
      }
    }));
    return out;
  }, [form, step, isReview, isItemStep, typingItem]);

  // A rate row is only usable if it names something and states a number.
  const badRates = useMemo(() => {
    if (!typingItem) return [];
    return taxRates
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => String(r.Name).trim() === '' || String(r.Value).trim() === ''
        || Number.isNaN(Number(r.Value)) || Number(r.Value) < 0)
      .map(({ i }) => i);
  }, [taxRates, typingItem]);

  // Can this step move on? Stated once, because both the button and the Enter
  // key ask it.
  const canAdvance = useMemo(() => {
    if (isReview) return false;
    if (missing.length > 0) return false;
    if (isItemStep && typingItem) return taxRates.length > 0 && badRates.length === 0;
    // A file was chosen but has nothing usable in it: moving on would silently
    // mean "no items", which is what the checkbox above is for.
    if (isItemStep && uploadingItems) return importRows.length > 0;
    return true;
  }, [isReview, missing, isItemStep, typingItem, uploadingItems, taxRates, badRates, importRows]);

  const update = (path, name, value) => setForm((prev) => setVal(prev, path, name, value));

  const goNext = () => {
    if (!canAdvance) { setShowErrors(true); return; }
    setShowErrors(false);
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setShowErrors(false);
    // From the first step, step back to the welcome screen rather than dead-ending.
    if (stepIdx === 0) { setStarted(false); return; }
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  // Enter submits the step — deliberately NOT on Review, where the button
  // commits a transaction, and never from inside the paste box, where a newline
  // is a row separator.
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || isReview || submitting) return;
    if (e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    goNext();
  };

  // ── The file ───────────────────────────────────────────────────────────────
  const runCheck = (raw) => {
    const outcome = checkFile(raw);
    if (outcome.valid.length === 0 && outcome.invalid.length === 0) {
      toast.error(outcome.fileErrors[0] || 'That file has no rows');
      return;
    }
    setParsed(outcome);
    setShowAllRows(false);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => { setCsvText(String(reader.result)); runCheck(String(reader.result)); };
    reader.readAsText(file);
    // Lets the same file be chosen again after a Remove.
    e.target.value = '';
  };

  const clearFile = () => {
    setFileName(''); setCsvText(''); setParsed(null); setShowAllRows(false);
  };

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
    // Only the TYPED item rides inside the transaction. A file's items are
    // created afterwards — the bulk endpoint sits behind the first-time setup
    // gate and cannot be called until this tenancy exists.
    if (typingItem && seeded.item) {
      payload.item = clean(seeded.item);
      // The rates the group is named for. Sent as the group's own field so the
      // orchestrator maps them in; without them the group prices at 0%.
      payload.item.costInfo = payload.item.costInfo || {};
      payload.item.costInfo.taxGroup = {
        ...(payload.item.costInfo.taxGroup || {}),
        taxTypes: taxRates.map((r) => ({ Name: String(r.Name).trim(), Value: String(r.Value).trim() })),
      };
    }
    return payload;
  };

  /**
   * Two passes, in this order — the second cannot run before the first.
   *
   * The tenancy is ONE transaction: all of it or none of it. The items from a
   * file are independent writes that the setup gate blocks until that
   * transaction has committed. So they are reported separately: if the items
   * half-fail, the tenancy still stands and the application is unlocked, and
   * telling the user otherwise would send them to re-run a setup that already
   * succeeded.
   */
  const submit = async () => {
    setSubmitting(true);
    setPhase({ tenancy: 'running', items: uploadingItems ? 'waiting' : null });
    let ids = null;
    try {
      const res = await bootstrapMasterData(buildPayload());
      const { setupToken, ...created } = res.data?.data ?? res.data ?? {};
      ids = created;

      // Swap in the refreshed token BEFORE anything else runs. The token in hand
      // still says setupCompleted:false, so without this the bulk import below —
      // and the route guard — would both still be gated.
      if (setupToken) applyToken(setupToken);
      setPhase((p) => ({ ...p, tenancy: 'done' }));
    } catch (err) {
      setPhase(null);
      setSubmitting(false);
      toast.error(err.response?.data?.message || 'Failed to create master data. Nothing was saved.');
      return;
    }

    // ── Pass two ─────────────────────────────────────────────────────────────
    let items = null;
    let menu = null;
    if (uploadingItems && importRows.length > 0) {
      setPhase((p) => ({ ...p, items: 'running' }));
      try {
        items = await importService.importItems(
          importRows.map(({ line, ...row }) => row), 'skip',
        );

        if (publishToBranch && ids?.branch) {
          // Only what actually landed, and each row carrying its OWN food type —
          // sending one default for the whole file is what published a mixed
          // menu as entirely Veg.
          const byName = new Map(importRows.map((v) => [v.name, v.foodType]));
          const landed = (items.rows || [])
            .filter((r) => r.status === 'created' || r.status === 'updated' || r.status === 'skipped')
            .map((r) => ({ name: r.name, foodType: byName.get(r.name) || undefined }));
          if (landed.length) {
            menu = await importService.publishMenuEntries({
              branchDetailId: ids.branch, defaultFoodType: 'VEG', items: landed,
            });
          }
        }
        setPhase((p) => ({ ...p, items: 'done' }));
      } catch (err) {
        // The tenancy stands. Say so rather than letting a failed second pass
        // read as a failed setup.
        setPhase((p) => ({ ...p, items: 'failed' }));
        toast.warn(
          err.response?.data?.message
          || 'Your tenancy was created, but the items could not be imported. You can import them from Master Data → Items.',
        );
      }
    }

    setResult({ ids, items, menu });
    setSubmitting(false);
    toast.success('Master data created successfully.');
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
            Your organization and branch were created in a single transaction. The
            rest of the application is now unlocked, and this wizard will not be
            shown again.
          </p>
          <ReviewPanel form={form} includeItem={typingItem} taxRates={taxRates} />
          {result.items && (
            <ImportResult
              items={result.items}
              menu={result.menu}
              fileName={fileName}
            />
          )}
          {/* No "set up another": the wizard runs once per tenant and the API
              answers 409 on a second attempt. */}
          <button className="mds-btn mds-btn-primary" onClick={() => navigate(ROUTES.DASHBOARD)}>
            Continue to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Welcome / intro screen ───────────────────────────────────────────────────
  // Shown first so the user lands on a focused "let's set up your tenancy" screen
  // instead of an immediate form. "Begin setup" enters the step-by-step wizard.
  if (!started) {
    return (
      <div className="mds-wrap">
        <div className="mds-card mds-intro">
          <div className="mds-intro-icon">🚀</div>
          <h1>Setup Wizard</h1>
          <p className="mds-intro-lead">
            Let's set up your tenancy. This one-time wizard creates your
            Organization, Branch and (optionally) your first items together — the
            tenancy is all-or-nothing, so nothing is saved unless every step
            succeeds.
          </p>

          {setupPending && (
            <div className="mds-gate-banner" role="alert">
              <strong>Finish this setup to unlock the application.</strong>
              <span>
                Until your organization and branch exist, the only pages available
                are Home, Audit Logs and signing out.
              </span>
            </div>
          )}

          <ol className="mds-intro-steps">
            {STEPS.map((s) => (
              <li key={s.key}>
                <span className="mds-intro-step-title">{s.title}</span>
                {s.optional && <span className="mds-intro-step-tag">optional</span>}
              </li>
            ))}
          </ol>

          <button
            className="mds-btn mds-btn-primary mds-intro-cta"
            onClick={() => setStarted(true)}
          >
            Begin setup
          </button>
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="mds-wrap" onKeyDown={onKeyDown} role="presentation">
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
          <>
            <ReviewPanel form={form} includeItem={typingItem} taxRates={taxRates} />
            {uploadingItems && importRows.length > 0 && (
              <ReviewItems
                parsed={parsed}
                fileName={fileName}
                publishToBranch={publishToBranch}
                branchName={getVal(form, 'branch', 'Name')}
                onChange={() => setStepIdx(STEPS.findIndex((s) => s.key === 'item'))}
              />
            )}
            <TwoPassNote itemCount={uploadingItems ? importRows.length : 0} />
          </>
        ) : (
          <>
            {isItemStep && (
              <>
                <label className="mds-toggle">
                  <input type="checkbox" checked={includeItem} onChange={(e) => setIncludeItem(e.target.checked)} />
                  <span>Add a starter item now (you can also add items later)</span>
                </label>

                {includeItem && (
                  <div className="mds-source" role="radiogroup" aria-label="Where the items come from">
                    <button
                      type="button" role="radio" aria-checked={itemSource === SOURCE.SINGLE}
                      className={`mds-source-opt ${itemSource === SOURCE.SINGLE ? 'is-on' : ''}`}
                      onClick={() => setItemSource(SOURCE.SINGLE)}
                    >
                      <span className="mds-source-radio" aria-hidden="true" />
                      <span>
                        <strong>Type one item</strong>
                        <em>The starter item, filled in by hand. Created inside the same transaction as the branch.</em>
                      </span>
                    </button>
                    <button
                      type="button" role="radio" aria-checked={itemSource === SOURCE.FILE}
                      className={`mds-source-opt ${itemSource === SOURCE.FILE ? 'is-on' : ''}`}
                      onClick={() => setItemSource(SOURCE.FILE)}
                    >
                      <span className="mds-source-radio" aria-hidden="true" />
                      <span>
                        <strong>Upload a list</strong>
                        <em>A CSV of your whole menu. Checked here, created after you confirm.</em>
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}

            {(!isItemStep || typingItem) && step.groups.filter((g) => g.fields.some((f) => !f.hidden)).map((g) => (
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

                {/* The rates live under the tax group they belong to. A group
                    with none prices at 0%, so this is not an optional extra —
                    it is what makes the group mean anything. */}
                {g.path === 'item.costInfo.taxGroup' && (
                  <TaxRates
                    rates={taxRates}
                    invalid={showErrors ? badRates : []}
                    onChange={setTaxRates}
                  />
                )}
              </fieldset>
            ))}

            {isItemStep && uploadingItems && (
              <ItemFilePicker
                fileRef={fileRef}
                fileName={fileName}
                csvText={csvText}
                parsed={parsed}
                showAllRows={showAllRows}
                publishToBranch={publishToBranch}
                branchName={getVal(form, 'branch', 'Name')}
                onFile={onFile}
                onPaste={setCsvText}
                onCheck={() => runCheck(csvText)}
                onClear={clearFile}
                onShowAll={() => setShowAllRows(true)}
                onPublishChange={setPublishToBranch}
              />
            )}

            {isItemStep && !includeItem && (
              <>
                <p className="mds-skip-note">Item creation skipped — only the Organization and Branch will be created.</p>
                <div className="mds-note">
                  You can import a whole menu at any time from <strong>Master Data → Items</strong>.
                  Nothing here is a one-off.
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="mds-actions">
        <button className="mds-btn mds-btn-ghost" onClick={goBack} disabled={submitting}>
          Back
        </button>
        {isReview ? (
          <button className="mds-btn mds-btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create everything'}
          </button>
        ) : (
          <span className="mds-next">
            <span className="mds-enter-hint">
              <kbd>Enter</kbd> also moves on
            </span>
            <button className="mds-btn mds-btn-primary" onClick={goNext} disabled={submitting}>
              Next
            </button>
          </span>
        )}
      </div>

      {submitting && phase && <PhaseProgress phase={phase} itemCount={importRows.length} />}
    </div>
  );
};

// ── The rates inside a tax group ─────────────────────────────────────────────
const TaxRates = ({ rates, invalid, onChange }) => {
  const set = (i, key, value) => onChange(rates.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const total = rateTotal(rates);

  return (
    <div className="mds-rates">
      <div className="mds-rates-head">
        <span className="mds-rates-title">Rates<span className="mds-req">*</span></span>
        <span className="mds-hint">CGST + SGST for an intra-state sale</span>
        <span className="mds-rates-total">Total {total}%</span>
      </div>
      <div className="mds-rates-rows">
        {rates.map((r, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <React.Fragment key={`rate-${i}`}>
            <input
              aria-label={`Rate ${i + 1} name`}
              className={invalid.includes(i) ? 'is-invalid' : ''}
              value={r.Name}
              onChange={(e) => set(i, 'Name', e.target.value)}
            />
            <input
              aria-label={`Rate ${i + 1} percent`}
              className={invalid.includes(i) ? 'is-invalid' : ''}
              type="number" step="any" min="0"
              value={r.Value}
              onChange={(e) => set(i, 'Value', e.target.value)}
            />
            <button
              type="button" className="mds-rate-x" aria-label={`Remove rate ${i + 1}`}
              disabled={rates.length <= 1}
              onClick={() => onChange(rates.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </React.Fragment>
        ))}
      </div>
      <button type="button" className="mds-linkish" onClick={() => onChange([...rates, { Name: '', Value: '' }])}>
        + Add a rate
      </button>
      {invalid.length > 0 && <small className="mds-error">Every rate needs a name and a percentage</small>}
      <small className="mds-hint mds-rates-note">
        The group's name is a label — these rates are what actually gets charged. Replace
        both with a single IGST row for an inter-state sale.
      </small>
    </div>
  );
};

// ── The file picker and its check ────────────────────────────────────────────
const ItemFilePicker = ({
  fileRef, fileName, csvText, parsed, showAllRows, publishToBranch, branchName,
  onFile, onPaste, onCheck, onClear, onShowAll, onPublishChange,
}) => {
  const counts = parsed?.counts;
  const rows = parsed ? [...parsed.invalid.map((r) => ({ ...r, bad: true })), ...parsed.valid] : [];
  const shown = showAllRows ? rows : rows.slice(0, 7);

  return (
    <>
      {!parsed ? (
        <>
          <button type="button" className="mds-drop" onClick={() => fileRef.current?.click()}>
            <strong>Choose a CSV</strong>
            name, category, unit, price and tax group are required
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} aria-label="Choose a CSV" />
          <div className="mds-or">or paste rows</div>
          <textarea
            className="mds-paste"
            aria-label="Paste rows"
            value={csvText}
            placeholder={'name,category,unit,price,tax_group\nPlain Tea,Tea,Glass,15,GST 5%'}
            onChange={(e) => onPaste(e.target.value)}
          />
          <div className="mds-drop-actions">
            <button
              type="button" className="mds-linkish"
              onClick={() => download('items-template.csv', toCsv(COLUMNS, TEMPLATE_ROWS))}
            >
              Download template
            </button>
            <button
              type="button" className="mds-btn mds-btn-ghost mds-btn-sm"
              disabled={!csvText.trim()} onClick={onCheck}
            >
              Check rows
            </button>
          </div>
          <div className="mds-note">
            Your file is read and checked <strong>in this browser</strong>. Nothing reaches the
            server until you confirm on the next step.
          </div>
        </>
      ) : (
        <>
          <div className="mds-file">
            <span className="mds-file-name">{fileName || 'Pasted rows'}</span>
            <span className="mds-hint">{rows.length} rows</span>
            <button type="button" className="mds-linkish mds-file-x" onClick={onClear}>Remove</button>
          </div>

          <div className="mds-chips">
            <span className="mds-chip ok">
              {counts.valid} {counts.valid === 1 ? 'item' : 'items'} will be created
            </span>
            <span className="mds-chip">{counts.categories} {counts.categories === 1 ? 'category' : 'categories'}</span>
            <span className="mds-chip">{counts.units} {counts.units === 1 ? 'unit' : 'units'}</span>
            <span className="mds-chip">{counts.taxGroups} tax {counts.taxGroups === 1 ? 'group' : 'groups'}</span>
            {counts.defaulted > 0 && (
              <span className="mds-chip warn">
                {counts.defaulted} {counts.defaulted === 1 ? 'row states' : 'rows state'} no tax rate
                — {DEFAULT_TAX.replace(/\|/g, ' + ')} will be applied
              </span>
            )}
            {counts.conflicts.map((g) => (
              <span key={g} className="mds-chip bad">
                Tax group “{g}” is given two different sets of rates
              </span>
            ))}
            {counts.invalid > 0 && (
              <span className="mds-chip bad">
                {counts.invalid} {counts.invalid === 1 ? 'row' : 'rows'} cannot be read
              </span>
            )}
          </div>

          <div className="mds-preview">
            <table>
              <thead>
                <tr><th>#</th><th>Name</th><th>Category</th><th className="mds-num">Price</th><th>Outcome</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`r${r.line}`} className={r.bad ? 'is-bad' : undefined}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.bad ? '' : r.category}</td>
                    <td className="mds-num">{r.bad ? '' : r.price}</td>
                    <td>
                      <span className={`mds-dot ${r.bad ? 'r' : 'g'}`} />
                      {r.bad ? r.error : 'Create'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > shown.length && (
              <div className="mds-preview-more">
                {rows.length - shown.length} more rows ·{' '}
                <button type="button" className="mds-linkish" onClick={onShowAll}>
                  Show all {rows.length}
                </button>
              </div>
            )}
          </div>

          <label className="mds-opt">
            <input
              type="checkbox" checked={publishToBranch}
              onChange={(e) => onPublishChange(e.target.checked)}
            />
            <span>
              <strong>Also publish these to the branch menu</strong>
              <em>
                Items are tenancy-wide; nothing sells until it is on a branch's menu.
                {branchName ? ` They will go onto ${branchName}.` : ''}
              </em>
            </span>
          </label>

          <div className="mds-note">
            <strong>Nothing has been saved.</strong> This check runs entirely in your browser.
            The items are created after you confirm on the next step — they cannot be created
            before the tenancy they belong to exists.
          </div>
        </>
      )}
    </>
  );
};

// ── Review ───────────────────────────────────────────────────────────────────
const ReviewPanel = ({ form, includeItem, taxRates }) => {
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
  if (includeItem) {
    push('Item', form.item, ['Name', 'Code']);
    push('Category', form.item?.category, ['Name']);
    push('Unit', form.item?.uom, ['UnitName']);
    push('Cost', form.item?.costInfo, ['Amount']);
    push('Tax Group', form.item?.costInfo?.taxGroup, ['Name']);
    // The rates, not just the group's name — the name is a label and this is
    // the last chance to notice it says 18% while the rates add up to 5%.
    if (taxRates?.length) {
      rows.push({
        label: 'Tax Rates',
        value: `${taxRates.map((r) => `${r.Name} ${r.Value}%`).join(' + ')} = ${rateTotal(taxRates)}%`,
      });
    }
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

// The list gets its own block rather than another one-line row: a dozen items
// is not a field, and the last chance to notice the wrong file is here.
const ReviewItems = ({ parsed, fileName, publishToBranch, branchName, onChange }) => {
  const { counts, valid } = parsed;
  return (
    <div className="mds-review-items">
      <div className="mds-review-items-head">
        <h3>Items</h3>
        <span className="mds-hint">from {fileName || 'pasted rows'}</span>
        <button type="button" className="mds-linkish" onClick={onChange}>Change</button>
      </div>
      <div className="mds-chips">
        <span className="mds-chip ok">{counts.valid} {counts.valid === 1 ? 'item' : 'items'}</span>
        <span className="mds-chip">{counts.categories} {counts.categories === 1 ? 'category' : 'categories'}</span>
        <span className="mds-chip">{counts.units} {counts.units === 1 ? 'unit' : 'units'}</span>
        <span className="mds-chip">{counts.taxGroups} tax {counts.taxGroups === 1 ? 'group' : 'groups'}</span>
        {publishToBranch && branchName && <span className="mds-chip">published to {branchName}</span>}
        {counts.invalid > 0 && <span className="mds-chip bad">{counts.invalid} rows left out</span>}
      </div>
      <p className="mds-review-items-list">
        {valid.slice(0, 6).map((v) => v.name).join(', ')}
        {valid.length > 6 && ` and ${valid.length - 6} more`}
      </p>
    </div>
  );
};

/**
 * What "Create everything" actually does.
 *
 * The tenancy is one transaction; the items are independent writes that cannot
 * even be attempted until it has committed. Calling both "Create everything" is
 * fine; pretending they are one act is not — because when the second half
 * half-fails, the user has to already know the first half stands.
 */
const TwoPassNote = ({ itemCount }) => (
  <div className="mds-phases">
    <h3>What happens when you confirm</h3>
    <p className="mds-hint">
      {itemCount > 0
        ? 'Two passes, in this order — the second cannot run before the first.'
        : 'One transaction. All of it, or none of it.'}
    </p>
    <div className="mds-phase">
      <span className="mds-phase-n">1</span>
      <span>
        <span className="mds-phase-t">Your tenancy, in one transaction</span>
        <span className="mds-phase-s">
          Organization, branch, address, contact, invoice numbering, and the standard POS
          and ledger masters. All of it or none of it — if any part fails, nothing is saved
          and you stay on this screen.
        </span>
      </span>
    </div>
    {itemCount > 0 && (
      <div className="mds-phase">
        <span className="mds-phase-n">2</span>
        <span>
          <span className="mds-phase-t">Your {itemCount} {itemCount === 1 ? 'item' : 'items'}, one at a time</span>
          <span className="mds-phase-s">
            Each row is saved on its own, so one bad item cannot undo the others — or the
            tenancy created in pass one. Anything that fails comes back as a list you can
            fix and re-import.
          </span>
        </span>
      </div>
    )}
  </div>
);

const PhaseProgress = ({ phase, itemCount }) => (
  <div className="mds-card mds-progress" role="status" aria-live="polite">
    <h3>Setting up your tenancy</h3>
    <p className="mds-hint">Don't close this tab.</p>
    <div className="mds-phase">
      <span className={`mds-phase-n ${phase.tenancy === 'done' ? 'is-done' : ''}`}>
        {phase.tenancy === 'done' ? '✓' : '1'}
      </span>
      <span>
        <span className="mds-phase-t">
          {phase.tenancy === 'done' ? 'Your tenancy is created' : 'Creating your tenancy…'}
        </span>
        {phase.tenancy === 'done' && (
          <span className="mds-phase-s">
            The application is unlocked from here on, whatever happens below.
          </span>
        )}
      </span>
    </div>
    {phase.items && (
      <div className="mds-phase">
        <span className={`mds-phase-n ${phase.items === 'done' ? 'is-done' : ''}`}>
          {phase.items === 'done' ? '✓' : '2'}
        </span>
        <span>
          <span className="mds-phase-t">
            {phase.items === 'waiting' && `${itemCount} items — waiting for the tenancy`}
            {phase.items === 'running' && `Creating your ${itemCount} items…`}
            {phase.items === 'done' && 'Your items are created'}
            {phase.items === 'failed' && 'The items could not be imported'}
          </span>
          <span className="mds-phase-s">
            Each row is saved on its own, so anything already done stays done.
          </span>
        </span>
      </div>
    )}
  </div>
);

// ── What the second pass actually did ────────────────────────────────────────
const ImportResult = ({ items, menu, fileName }) => {
  const summary = items.summary || {};
  const failed = (items.rows || []).filter((r) => r.status === 'failed');
  return (
    <div className="mds-import-result">
      <div className="mds-review-items-head">
        <h3>Items from {fileName || 'your list'}</h3>
        <span className="mds-hint">created after the tenancy, one at a time</span>
      </div>
      <div className="mds-results">
        <div className="mds-res ok"><span className="n">{summary.created || 0}</span><span className="l">created</span></div>
        {summary.updated > 0 && (
          <div className="mds-res"><span className="n">{summary.updated}</span><span className="l">updated</span></div>
        )}
        <div className="mds-res warn"><span className="n">{summary.skipped || 0}</span><span className="l">skipped</span></div>
        <div className="mds-res bad"><span className="n">{summary.failed || 0}</span><span className="l">failed</span></div>
      </div>

      {menu && (
        <div className="mds-next">
          <strong>{menu.summary?.created || 0} published to the menu.</strong> They are on the
          till now. Open one in Master Data → Items to re-price it, or in Menu Master to change
          its channels and variants.
        </div>
      )}

      {failed.length > 0 && (
        <>
          <div className="mds-preview">
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Why</th></tr></thead>
              <tbody>
                {failed.map((r) => (
                  <tr key={`f${r.row}`} className="is-bad">
                    <td>{r.row}</td><td>{r.name}</td>
                    <td><span className="mds-dot r" />{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mds-hint">
            These changed nothing. Fix them in a spreadsheet and import again from
            Master Data → Items.
          </p>
          <button
            type="button" className="mds-btn mds-btn-ghost mds-btn-sm"
            onClick={() => download('failed-rows.csv', toCsv(['name', 'reason'], failed.map((r) => [r.name, r.reason])))}
          >
            Download the {failed.length} failed {failed.length === 1 ? 'row' : 'rows'}
          </button>
        </>
      )}
    </div>
  );
};

export default MasterDataSetup;
