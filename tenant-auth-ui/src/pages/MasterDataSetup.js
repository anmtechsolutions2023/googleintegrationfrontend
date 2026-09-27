import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { bootstrapMasterData } from '../services/masterSetupService';
import { getFieldLimits } from '../services/posService';
import importService from '../services/importService';
import { toCsv } from '../utils/csv';
import { COLUMNS, TEMPLATE_ROWS, DEFAULT_TAX, checkFile, download, EXEMPT_TAX_GROUP, isExemptGroup } from '../utils/itemImport';
import { useAuth } from '../context/AuthContext';
import { isSetupPending } from '../utils/permissions';
import { ROUTES } from '../constants/routes';
import './MasterDataSetup.css';

import { gstinProblem, stateOfGstin } from '../utils/gstin';
import MediaUploadCard from '../components/frontdesk/MediaUploadCard';

/**
 * Enough to catch a typo, not enough to argue about.
 *
 * The server applies Joi's own email rule with the TLD list off; this is the same
 * shape, checked while typing so a mistake is caught before the transaction. Blank
 * is never a problem — the field is optional and `missing` is what handles required.
 */
const emailProblem = (v) => {
  const value = String(v || '').trim();
  if (!value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? null
    : 'That does not look like an email address';
};

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
        // RELABELLED, not renamed. This is organizationdetail.Name, and for years
        // it was the first thing the wizard asked for and the one thing no customer
        // ever saw: it labelled the tenancy in the admin directory and reached no
        // bill. It can now print — Receipt Format → Bill → Header → Legal name —
        // but a tenant who types their trading name here and a branch code below
        // would still find the branch code on every bill. So the labels say which
        // is which.
        {
          name: 'Name', label: 'Legal / group name', required: true,
          limitKey: 'organizationdetail.Name',
          hint: 'Your registered company or group name.',
          tip: 'Not printed on bills unless you switch it on. Change later at Front Desk → Business Profile → Business.',
        },
      ] },
    ],
  },
  {
    key: 'branch',
    title: 'Branch',
    groups: [
      { title: 'Branch', path: 'branch', fields: [
        {
          name: 'Name', label: 'Outlet name', required: true,
          limitKey: 'branchdetail.BranchName',
          hint: 'This is what prints at the top of every bill.',
          tip: 'Change later at Front Desk → Business Profile → Business.',
        },
        // Optional, but kept in the main group rather than behind the panel: it is
        // short, it decides whether bills are tax invoices at all, and a restaurant
        // that has one knows it.
        {
          name: 'GSTIN', label: 'GSTIN (optional)', maxLength: 15, upper: true,
          hint: 'Printed on tax invoices and used for GST returns.',
          tip: 'Change later at Front Desk → Business Profile → Tax & Compliance. Each invoice keeps the GSTIN it was issued under.',
          validate: gstinProblem,
          describe: (v) => (stateOfGstin(v) ? `Registered in ${stateOfGstin(v)}` : null),
        },
      ] },
      { title: 'Address', path: 'branch.address', fields: [
        { name: 'AddressLine1', label: 'Address Line 1', required: true, limitKey: 'addressdetail.AddressLine1' },
        // Address tag is fixed for onboarding — hidden from the UI, sent to the API.
        { name: 'TagName', label: 'Address Tag', required: true, hidden: true, value: 'Onboarding' },
        { name: 'City', limitKey: 'addressdetail.City' },
        { name: 'State', limitKey: 'addressdetail.State' },
        { name: 'Pincode', limitKey: 'addressdetail.Pincode' },
        // Address Type is fixed to 'Onboarding' for onboarding — hidden from the UI,
        // sent to the API (backend reuses the existing type or creates it).
        { name: 'Name', label: 'Address Type', required: true, hidden: true, value: 'Onboarding', path: 'branch.address.contactAddressType' },
      ] },
      { title: 'Contact', path: 'branch.contact', fields: [
        { name: 'FirstName', label: 'First Name', required: true, limitKey: 'contactdetail.FirstName' },
        { name: 'LastName', label: 'Last Name', required: true, limitKey: 'contactdetail.LastName' },
      ] },

      // ── Everything below here is behind a collapsed panel ──────────────────
      //
      // Eleven more boxes on this step would undo the thing the wizard was cut
      // down for: the required path is seven fields and a new tenant gets a
      // working branch out of it. These are offered, not asked — closed by
      // default, every one optional, and every one naming where it can be set
      // later so skipping it costs nothing.
      //
      // Fields carry their own `path` because the panel spans three records: the
      // branch, its address and its contact.
      {
        title: 'More business details',
        optional: true,
        path: 'branch',
        blurb: 'All optional. Everything here can also be set later at Front Desk → Business Profile.',
        fields: [
          {
            name: 'PAN', label: 'PAN', limitKey: 'branchdetail.PAN', upper: true,
            tip: 'Change later at Business Profile → Tax & Compliance. Not printed unless you switch it on at Receipt Format.',
          },
          {
            name: 'TINNo', label: 'TIN', limitKey: 'branchdetail.TINNo', upper: true,
            tip: 'Pre-GST registration number. Change later at Business Profile → Tax & Compliance.',
          },
          {
            name: 'FSSAI', label: 'FSSAI licence', limitKey: 'branchdetail.FSSAI',
            hint: 'Displaying it is a licence condition for most food businesses.',
            tip: 'Change later at Business Profile → Tax & Compliance. Switch printing on at Receipt Format → Bill → Header.',
          },
          {
            name: 'MobileNo', label: 'Mobile', path: 'branch.contact', maxLength: 20,
            tip: 'Can print on bills as the number to call. Change later at Business Profile → Address & Contact.',
          },
          {
            name: 'Landline1', label: 'Landline', path: 'branch.contact', maxLength: 20,
            tip: 'Used on bills only when no mobile is set. Change later at Business Profile → Address & Contact.',
          },
          {
            name: 'Email', label: 'Email', path: 'branch.contact',
            limitKey: 'contactdetail.Email',
            validate: emailProblem,
            tip: 'Change later at Business Profile → Address & Contact.',
          },
          {
            name: 'AddressLine2', label: 'Address line 2', path: 'branch.address',
            limitKey: 'addressdetail.AddressLine2',
            tip: 'Included in the printed address when set. Change later at Business Profile → Address & Contact.',
          },
          {
            name: 'Landmark', label: 'Landmark', path: 'branch.address',
            limitKey: 'addressdetail.Landmark',
            tip: 'Included in the printed address when set. Change later at Business Profile → Address & Contact.',
          },
        ],
      },
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
        { name: 'Name', label: 'Item Name', required: true, limitKey: 'itemdetail.Name' },
        { name: 'Code', limitKey: 'itemdetail.Code' },
      ] },
      { title: 'Category', path: 'item.category', fields: [
        { name: 'Name', label: 'Category Name', required: true, limitKey: 'categorydetail.Name', hint: 'e.g. Starter, Main course' },
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
        // Optional, and starts as the tenant's Exempt (0%) group: a starter item
        // is sold tax-free unless somebody names a group and gives it rates.
        { name: 'Name', label: 'Tax Group Name', limitKey: 'taxgroup.Name', hint: `Optional — ${EXEMPT_TAX_GROUP} sells it tax-free. Name a group and add its rates to charge tax.` },
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
  // The starter item's tax group begins as the tenant's Exempt (0%) group, so
  // the Tax Group section can be left untouched.
  const [form, setForm] = useState({ item: { costInfo: { taxGroup: { Name: EXEMPT_TAX_GROUP } } } });
  const [includeItem, setIncludeItem] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  // Column widths, fetched from the server rather than mirrored here. A second
  // copy of these numbers is exactly how this wizard came to accept 200 characters
  // for a VARCHAR(50) column: the input could not overflow if it knew the limit.
  const [limits, setLimits] = useState({});
  useEffect(() => {
    getFieldLimits().then(setLimits).catch(() => setLimits({}));
  }, []);

  // Which optional panels are open. Closed by default — that is the whole point of
  // them.
  const [openPanels, setOpenPanels] = useState({});
  const togglePanel = (key) => setOpenPanels((o) => ({ ...o, [key]: !o[key] }));

  // Branding. Held as data URIs and sent inside the bootstrap payload, because
  // there is no branch to attach them to until that transaction commits.
  const [media, setMedia] = useState({ logo: '', paymentQr: '' });
  const [mediaMeta, setMediaMeta] = useState({});

  // The GST answer. `null` means "not answered", which is NOT the same as "charging"
  // — it writes no pos_tax_setting row at all and leaves the tenant on the table's
  // own default. Writing GstCharging = 1 here would look identical today and
  // diverge the moment that default is reconsidered.
  const [gstAnswer, setGstAnswer] = useState(null);

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  const [itemSource, setItemSource] = useState(SOURCE.SINGLE);
  // Empty: the tax group starts as Exempt (0%), which carries no rates.
  const [taxRates, setTaxRates] = useState([]);
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

  // Optional fields that were filled in wrongly — a GSTIN with a typo. Blank is
  // never a problem here; that is what `missing` is for.
  const problems = useMemo(() => {
    if (isReview) return {};
    if (isItemStep && !typingItem) return {};
    const out = {};
    step.groups?.forEach((g) => g.fields.forEach((f) => {
      if (f.hidden || !f.validate) return;
      const fp = f.path || g.path;
      const message = f.validate(getVal(form, fp, f.name));
      if (message) out[`${fp}.${f.name}`] = message;
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

  // The tax group and its rates have to agree. Exempt (0%) — or a blank name —
  // carries no rates; any other group has to carry some, or it is a group named
  // "GST 18%" that charges nothing.
  const taxGroupName = String(getVal(form, 'item.costInfo.taxGroup', 'Name')).trim();
  const exemptGroup = isExemptGroup(taxGroupName);
  const taxProblem = useMemo(() => {
    if (!typingItem) return null;
    if (exemptGroup && taxRates.length > 0) {
      return `${EXEMPT_TAX_GROUP} carries no rates. Give this group its own name to charge tax, or remove the rates.`;
    }
    if (!exemptGroup && taxRates.length === 0) {
      return `Add the rates for “${taxGroupName}”, or set the group back to ${EXEMPT_TAX_GROUP}.`;
    }
    return null;
  }, [typingItem, exemptGroup, taxRates, taxGroupName]);

  // Can this step move on? Stated once, because both the button and the Enter
  // key ask it.
  const canAdvance = useMemo(() => {
    if (isReview) return false;
    if (missing.length > 0) return false;
    if (Object.keys(problems).length > 0) return false;
    if (isItemStep && typingItem) return badRates.length === 0 && !taxProblem;
    // A file was chosen but has nothing usable in it: moving on would silently
    // mean "no items", which is what the checkbox above is for.
    if (isItemStep && uploadingItems) return importRows.length > 0;
    return true;
  }, [isReview, missing, problems, isItemStep, typingItem, uploadingItems, badRates, taxProblem, importRows]);

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

    // Branding, when any was chosen. Validated and re-measured on the server before
    // the transaction opens, so a rejected image is a 400 with nothing attempted
    // rather than a rolled-back signup.
    const images = Object.fromEntries(
      Object.entries(media).filter(([, dataUri]) => !!dataUri),
    );
    if (Object.keys(images).length > 0) payload.branch.media = images;

    // The GST answer, only if one was given. See the note on gstAnswer.
    if (gstAnswer === 'charging') {
      payload.taxSetting = { gstCharging: true };
    } else if (gstAnswer === 'composition' || gstAnswer === 'unregistered') {
      payload.taxSetting = { gstCharging: false, offReason: gstAnswer };
    }
    // Only the TYPED item rides inside the transaction. A file's items are
    // created afterwards — the bulk endpoint sits behind the first-time setup
    // gate and cannot be called until this tenancy exists.
    if (typingItem && seeded.item) {
      payload.item = clean(seeded.item);
      // The rates the group is named for. Sent as the group's own field so the
      // orchestrator maps them in; without them the group prices at 0%.
      payload.item.costInfo = payload.item.costInfo || {};
      payload.item.costInfo.taxGroup = exemptGroup
        // Sold tax-free under the tenant's Exempt group, which the server
        // provisions in this same transaction. No rates: none apply.
        ? { Name: EXEMPT_TAX_GROUP }
        : {
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

            {(!isItemStep || typingItem) && step.groups
              .filter((g) => !g.optional && g.fields.some((f) => !f.hidden))
              .map((g) => (
              <fieldset className="mds-group" key={g.path + g.title}>
                <legend>{g.title}</legend>
                <div className="mds-grid">
                  {g.fields.filter((f) => !f.hidden).map((f) => {
                    const fp = f.path || g.path;
                    const id = `${fp}.${f.name}`;
                    const value = getVal(form, fp, f.name);
                    const invalid = showErrors && missing.includes(id);
                    const problem = problems[id];
                    // Said once they try to move on, or once the value is as long
                    // as it can be — not after the first character.
                    const cap = limits[f.limitKey] || f.maxLength;
                    const showProblem = !!problem
                      && (showErrors || (cap && String(value).length >= cap));
                    const described = !problem && f.describe ? f.describe(value) : null;
                    return (
                      <div className={`mds-field ${invalid || showProblem ? 'is-invalid' : ''}`} key={id}>
                        <label htmlFor={id}>
                          {f.label || f.name}{f.required && <span className="mds-req">*</span>}
                          {f.tip && <Tip text={f.tip} />}
                          {/* Only as the cap approaches. A counter on every field is
                              noise; one that appears near the edge is information. */}
                          {cap && String(value).length > cap * 0.8 && (
                            <span className="mds-count">{String(value).length}/{cap}</span>
                          )}
                        </label>
                        <input
                          id={id}
                          type={f.type === 'number' ? 'number' : 'text'}
                          step={f.type === 'number' ? 'any' : undefined}
                          maxLength={limits[f.limitKey] || f.maxLength}
                          autoCapitalize={f.upper ? 'characters' : undefined}
                          spellCheck={f.upper ? false : undefined}
                          aria-invalid={invalid || showProblem ? true : undefined}
                          value={value}
                          onChange={(e) => update(fp, f.name, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                        />
                        {described
                          ? <small className="mds-hint">{described}</small>
                          : f.hint && <small className="mds-hint">{f.hint}</small>}
                        {invalid && <small className="mds-error">Required</small>}
                        {showProblem && <small className="mds-error">{problem}</small>}
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
                    exempt={exemptGroup}
                    problem={showErrors ? taxProblem : null}
                  />
                )}
              </fieldset>
            ))}

            {/* ── The optional panels ────────────────────────────────────────
                Closed by default and stated as skippable. Each one says where its
                fields can be set later, so leaving them shut costs the tenant
                nothing they cannot recover. */}
            {!isItemStep && step.groups.filter((g) => g.optional).map((g) => (
              <OptionalPanel
                key={g.title}
                title={g.title}
                blurb={g.blurb}
                open={!!openPanels[g.title]}
                onToggle={() => togglePanel(g.title)}
              >
                <div className="mds-grid">
                  {g.fields.filter((f) => !f.hidden).map((f) => {
                    const fp = f.path || g.path;
                    const id = `${fp}.${f.name}`;
                    const value = getVal(form, fp, f.name);
                    const problem = problems[id];
                    const cap = limits[f.limitKey] || f.maxLength;
                    return (
                      <div className={`mds-field ${problem ? 'is-invalid' : ''}`} key={id}>
                        <label htmlFor={id}>
                          {f.label || f.name}
                          {f.tip && <Tip text={f.tip} />}
                          {cap && String(value).length > cap * 0.8 && (
                            <span className="mds-count">{String(value).length}/{cap}</span>
                          )}
                        </label>
                        <input
                          id={id}
                          type="text"
                          maxLength={cap}
                          autoCapitalize={f.upper ? 'characters' : undefined}
                          spellCheck={f.upper ? false : undefined}
                          aria-invalid={problem ? true : undefined}
                          value={value}
                          onChange={(e) => update(
                            fp, f.name, f.upper ? e.target.value.toUpperCase() : e.target.value,
                          )}
                        />
                        {f.hint && !problem && <small className="mds-hint">{f.hint}</small>}
                        {problem && <small className="mds-error">{problem}</small>}
                      </div>
                    );
                  })}
                </div>
              </OptionalPanel>
            ))}

            {/* ── Branding ───────────────────────────────────────────────────
                On the Branch step because that is what a logo belongs to.
                Deliberately last and deliberately closed: choosing two images is
                the slowest thing anyone could be asked to do during signup, on a
                phone, and it is the one thing a new restaurant is least likely to
                have to hand. */}
            {step.key === 'branch' && (
              <OptionalPanel
                title="Branding"
                blurb="Add your logo now, or later from Business Profile — bills print fine without one."
                open={!!openPanels.Branding}
                onToggle={() => togglePanel('Branding')}
              >
                <div className="mds-media-grid">
                  <MediaUploadCard
                    label="Logo"
                    hint="Monochrome prints best. Wide, short images suit a till roll."
                    value={media.logo}
                    meta={mediaMeta.logo}
                    onChange={(dataUri, meta) => {
                      setMedia((m) => ({ ...m, logo: dataUri }));
                      setMediaMeta((m) => ({ ...m, logo: meta }));
                    }}
                    onRemove={() => {
                      setMedia((m) => ({ ...m, logo: '' }));
                      setMediaMeta((m) => ({ ...m, logo: undefined }));
                    }}
                  />
                  <MediaUploadCard
                    label="Payment QR"
                    hint="A static UPI QR from your bank or PSP. The customer types the amount."
                    value={media.paymentQr}
                    meta={mediaMeta.paymentQr}
                    onChange={(dataUri, meta) => {
                      setMedia((m) => ({ ...m, paymentQr: dataUri }));
                      setMediaMeta((m) => ({ ...m, paymentQr: meta }));
                    }}
                    onRemove={() => {
                      setMedia((m) => ({ ...m, paymentQr: '' }));
                      setMediaMeta((m) => ({ ...m, paymentQr: undefined }));
                    }}
                  />
                </div>
                <p className="mds-hint">
                  Both start switched off on bills. Turn them on at Front Desk →
                  Receipt Format once you are set up.
                </p>
              </OptionalPanel>
            )}

            {/* ── Tax ────────────────────────────────────────────────────────
                "Decide later" is the default AND a real answer: it writes no row,
                leaving the tenant on the same behaviour every tenant has had. */}
            {step.key === 'branch' && (
              <OptionalPanel
                title="Tax"
                blurb="You can change this whenever you like."
                open={!!openPanels.Tax}
                onToggle={() => togglePanel('Tax')}
              >
                <GstQuestion value={gstAnswer} onChange={setGstAnswer} />
              </OptionalPanel>
            )}

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
/**
 * The "where can I change this later?" marker.
 *
 * A native `title` attribute rather than a custom popover, deliberately: it works
 * on a keyboard, it works with a screen reader, it cannot be clipped by a parent's
 * overflow, and it costs no library. The trade-off is that it does not appear on
 * touch — so a tooltip never carries anything the user NEEDS. Every one of these is
 * a reassurance ("you can change this later at X"), never an instruction, and the
 * fields that genuinely need guidance carry a visible `hint` instead.
 */
//
// NO aria-label HERE, deliberately. An aria-label puts this text into the
// accessible-NAME space, and the marker beside the GSTIN box says "…keeps the GSTIN
// it was issued under" — so "find the thing labelled GSTIN" started matching two
// elements, the input and the marker. That is not merely a test annoyance: a label
// names a control, and this is supplementary prose about one. `title` is what a
// native tooltip is, it is announced on a focusable element, and it leaves the
// input's accessible name to the <label> that belongs to it.
const Tip = ({ text }) => (
  <span className="mds-tip" title={text} tabIndex={0} role="note">
    ⓘ
  </span>
);

/**
 * A collapsed section of optional fields.
 *
 * WHY THE WIZARD HAS THESE AT ALL
 * The required path is seven fields, and getting it there was a fought-for
 * decision — the invoice-numbering boxes were removed because "where should your
 * invoice numbers start" is not a question a new tenant can answer, and they were
 * the last thing between them and a working branch. Eleven more boxes would undo
 * that. So the new fields are offered rather than asked: shut by default, stated as
 * optional, each naming where it can be set later.
 *
 * A <button> and a region rather than <details>/<summary>: the open state has to be
 * React's, because the wizard remembers it across steps and the Review panel needs
 * to know what was filled in.
 */
const OptionalPanel = ({ title, blurb, open, onToggle, children }) => (
  <section className={`mds-panel ${open ? 'is-open' : ''}`}>
    <button
      type="button"
      className="mds-panel-head"
      onClick={onToggle}
      aria-expanded={open}
    >
      <span className="mds-panel-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span className="mds-panel-title">{title}</span>
      <span className="mds-panel-tag">optional</span>
    </button>
    {open && (
      <div className="mds-panel-body">
        {blurb && <p className="mds-panel-blurb">{blurb}</p>}
        {children}
      </div>
    )}
  </section>
);

/**
 * Do you charge GST?
 *
 * FOUR OPTIONS, AND THE FOURTH IS THE DEFAULT.
 * "Decide later" is not a cop-out — it is the only honest default. pos_tax_setting
 * treats the ABSENCE of a row as charging, chosen that way so a tenant with an
 * empty GSTIN field did not silently stop charging GST. Answering on the tenant's
 * behalf would write a row that says the same thing today and a different thing the
 * moment that default is reconsidered.
 *
 * Each "no" states what the paper will say, because that is the consequence the
 * tenant can actually check.
 */
const GST_OPTIONS = [
  {
    value: 'charging',
    label: 'Yes — we are registered for GST',
    note: 'Bills print as TAX INVOICE with the tax split out. Needs a GSTIN on the branch.',
  },
  {
    value: 'composition',
    label: 'No — we are on the composition scheme',
    note: 'Bills print as BILL OF SUPPLY with the composition declaration at the foot.',
  },
  {
    value: 'unregistered',
    label: 'No — we are not registered for GST',
    note: 'Bills print as BILL OF SUPPLY, with no GSTIN and no declaration.',
  },
  {
    value: null,
    label: 'Decide later',
    note: 'Bills charge GST, as they do for every new tenancy. Change it any time at POS Settings → GST.',
  },
];

const GstQuestion = ({ value, onChange }) => (
  <div className="mds-gst" role="radiogroup" aria-label="Do you charge GST?">
    {GST_OPTIONS.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        className={`mds-gst-opt ${value === o.value ? 'is-on' : ''}`}
        onClick={() => onChange(o.value)}
      >
        <span className="mds-gst-radio" aria-hidden="true" />
        <span>
          <strong>{o.label}</strong>
          <em>{o.note}</em>
        </span>
      </button>
    ))}
    <p className="mds-hint">
      Changing this later asks you to settle any open orders first — the bills on
      those tables were priced under the old setting.
    </p>
  </div>
);

const TaxRates = ({ rates, invalid, onChange, exempt, problem }) => {
  const set = (i, key, value) => onChange(rates.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const total = rateTotal(rates);

  return (
    <div className="mds-rates">
      <div className="mds-rates-head">
        <span className="mds-rates-title">Rates</span>
        <span className="mds-hint">CGST + SGST for an intra-state sale</span>
        <span className="mds-rates-total">Total {total}%</span>
      </div>
      {rates.length === 0 && (
        <p className="mds-rates-empty">
          {exempt
            ? 'No rates — this item is sold tax-free.'
            : 'No rates yet. A named group charges only the rates added here.'}
        </p>
      )}
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
              onClick={() => onChange(rates.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </React.Fragment>
        ))}
      </div>
      <span className="mds-rates-actions">
        <button type="button" className="mds-linkish" onClick={() => onChange([...rates, { Name: '', Value: '' }])}>
          + Add a rate
        </button>
        {rates.length === 0 && (
          <button type="button" className="mds-linkish" onClick={() => onChange(DEFAULT_RATES.map((r) => ({ ...r })))}>
            + Use CGST 2.5% + SGST 2.5%
          </button>
        )}
      </span>
      {invalid.length > 0 && <small className="mds-error">Every rate needs a name and a percentage</small>}
      {problem && <small className="mds-error">{problem}</small>}
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
            name, category, unit and price are required — a blank tax_group sells tax-free
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
  push('GSTIN', form.branch, ['GSTIN']);
  push('Address', form.branch?.address, ['AddressLine1', 'City', 'State', 'Pincode']);
  push('Address Type', form.branch?.address?.contactAddressType, ['Name']);
  push('Contact', form.branch?.contact, ['FirstName', 'LastName', 'Email']);
  if (includeItem) {
    push('Item', form.item, ['Name', 'Code']);
    push('Category', form.item?.category, ['Name']);
    push('Unit', form.item?.uom, ['UnitName']);
    push('Cost', form.item?.costInfo, ['Amount']);
    // A blank name is Exempt (0%), and says so rather than leaving the row out.
    if (isExemptGroup(form.item?.costInfo?.taxGroup?.Name)) {
      rows.push({ label: 'Tax Group', value: `${EXEMPT_TAX_GROUP} · sold tax-free` });
    } else {
      push('Tax Group', form.item?.costInfo?.taxGroup, ['Name']);
    }
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
