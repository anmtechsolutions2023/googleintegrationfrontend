# Tenant Profile & Onboarding — Implementation Plan

**Status:** DRAFT FOR REVIEW. No code written. No files changed.
**Companion to:** [TENANT_ONBOARDING_TRACEABILITY_AUDIT.md](TENANT_ONBOARDING_TRACEABILITY_AUDIT.md)
**Spans:** `googleintegrationfrontend/tenant-auth-ui` + `googleintegrationbackend`
**Date:** 2026-09-27

---

## 0. What this document is

Your instructions, turned into an engineering plan you can accept, cut or redirect before anything is built. It covers **what changes, where, in what order, and what it costs**.

It deliberately does **not** yet contain: screen mockups, field-by-field copy, wireframes, or the full click-through workflows. You said you'd ask for those after review — §14 lists exactly what I'd produce then.

**Two things I'm pushing back on** (§13). Both are about the wizard getting long. Please read that section before approving §7.

---

## 1. Your asks, reconciled against the audit

### 1.1 Your new features

| # | Ask | Status today | Verdict |
| --- | --- | --- | --- |
| 0a | Logo: upload + get + update + delete, endpoint + UI + optional wizard field | Catalogue toggle exists, **no storage, no renderer, no upload path anywhere in either repo** | Build from zero — see §4 (D1) |
| 0b | Payment QR: upload + get + update + delete, endpoint + UI + optional wizard field | Catalogue has a dead `upiQr` toggle ("Prints the branch VPA as a scannable block"). **No VPA storage, no QR generator, no renderer** | Build from zero, same machinery as logo |

> **New finding while planning this.** `upiQr` is a **third** dead catalogue field, alongside `logo` and `fssai` — same shape, same cause. `receipt.catalogue.js:196` defines it; nothing renders it and nothing stores a VPA. Your ask 0b fixes it.
>
> **And there is no file-upload capability in the backend at all.** I grepped `package.json` for `multer`/`busboy`/`formidable`/`sharp`/`aws-sdk`/`cloudinary`/`qrcode` and `src/` for `multipart`/`req.file`/`req.files` — nothing. This is greenfield, and it is the single largest item in the plan.

### 1.2 Your fixes vs my audit gaps

| Audit gap | Your instruction | Resolution |
| --- | --- | --- |
| K-1 Email collected & discarded | *"Need this also to be implemented, captured and editable"* | ✅ **Build it.** Overrides my "just delete the field" recommendation. New `contactdetail.Email` column. |
| K-2 FSSAI has no write path | Optional wizard field + editable later + configurable on receipt | ✅ **Build it.** Your requirements settle audit-Q3 in favour of **Option 2** (a real column), because Option 1 could not be collected in the wizard. |
| K-3 Logo dead toggle | Ask 0a | ✅ **Build it** rather than delete the toggle. |
| K-4 Org name never printed | *"Should be on receipt but configured show/not show"* | ✅ **Build it.** Settles audit-Q1: make it printable and configurable, not just relabelled. |
| K-5 Name/address not snapshotted | not mentioned | ⏸️ **Out of scope.** Flagged in §13.3 — it interacts with everything else you're adding. |
| K-6 No HSN/SAC | not mentioned | ⏸️ **Out of scope,** but it's 20 lines and your GST packs are shipping empty HSN sheets today. Recommend folding into Phase 3 — §13.4. |
| K-7 Two GSTIN doors | not mentioned | ✅ **Resolved for free** — the new Business Profile screen (§8) becomes the single door. |
| K-8 Stale held receipt format | not mentioned | ⚠️ **Gets worse.** Every field you add is another thing that can go stale on an open till. §6.4 adds invalidation. |
| K-9 Credit note has no FSSAI | not mentioned | ✅ **Folded in** — §9 applies the whole masthead set to bill *and* credit note. |
| K-10 Length mismatches | *"Follow validation based on the DB Column… Do this in general for all fields"* | ✅ **Build it,** repo-wide. §5. |
| K-11 No Business Information screen | *"Customer might need to know later which information he had provided during onboarding, how can they access and update"* | ✅ **This is the centrepiece.** §8. |
| K-12 No PDF/email | not mentioned | ⏸️ Out of scope. |

---

## 2. Scope summary

**In:**
1. Media subsystem — logo + payment QR, per branch: upload, get, update, delete, render on screen and on thermal paper.
2. Eleven new optional onboarding fields.
3. DB-derived validation, aligned repo-wide.
4. Nine new configurable receipt fields.
5. A **Business Profile** screen: one place to see and change everything entered at onboarding.
6. `contactdetail.Email` — new column, captured and editable.
7. Receipt-format cache invalidation.

**Out (recommended for a later phase):** seller name/address document snapshots (K-5), HSN/SAC in wizard + CSV (K-6 — but see §13.4), PDF generation, document email.

**Rough size:** 1 migration · ~6 new backend files · ~9 modified backend files · ~5 new frontend files · ~10 modified frontend files. **No new npm dependency** under the recommended designs.

---

## 3. Guiding principles for this work

Taken from the codebase's own stated conventions, not invented here.

1. **One catalogue entry per printable field.** `receipt.catalogue.js:11` — *"Adding a field is ONE entry here. No schema change, no migration, no edit to the validator, the editor or the API — they are all generated from this."* All nine of your §C.3 items exercise this. **This makes your ask far cheaper than it looks** — see §9.
2. **Values live where the record lives; visibility lives in the catalogue.** The `shop{}` / `documents{}` split at `receipt.format.service.js:96` is the existing seam. We widen `shop{}`; we do not invent a second config store.
3. **Only overrides are stored.** A branch accepting every default stores zero `pos_setting` rows (`receipt.format.service.js:13`). Preserved.
4. **No new source of truth.** The audit's §L warning stands: no `tenants`, `tenant_profile` or `business_settings` table. Every new field lands on the record that already owns its concern — `branchdetail`, `contactdetail`, `organizationdetail`.
5. **Optional means optional.** Every new field is nullable, absent-safe, and defaults to not printing. Existing tenants change in no way.
6. **Migrations are re-runnable.** `scripts/run-migration.js` header: *"DDL in MySQL is not transactional… the migrations are written to be re-runnable."* Ours will be.

---

## 4. Architecture decisions

Three decisions shape everything else. Each states the options, my pick and the trade-off.

### D1 — Where do logo and payment-QR images live?

| Option | How | Verdict |
| --- | --- | --- |
| **A. New `tenant_media` table, base64 JSON in/out** | `POST` a data URI in a JSON body; store bytes in a `LONGBLOB`; serve via an API endpoint | ✅ **Recommended** |
| B. `pos_setting` key/value | — | ❌ **Impossible.** `SettingValue` is `VARCHAR(1000)`; a 384px mono PNG is 2–8 KB base64 |
| C. Filesystem + `express.static` | write to disk | ❌ No static serving configured, no deploy manifest (no Dockerfile/Procfile/vercel.json in the backend) — an ephemeral host loses every logo on restart |
| D. S3 / Cloudinary | SDK + credentials | ❌ New dependency, new secrets, new failure mode, for two small images per branch |

**Why A works with no new dependency:** `config.SERVER.JSON_LIMIT` is already `'10mb'`. A data URI in a JSON body needs no multipart parser. Uploads are rare (twice per branch, ever); this is not a hot path.

**Design:**

```
POST   /api/pos/media          ?branchId=…   body { kind, dataUri }   → replaces (upsert)
GET    /api/pos/media          ?branchId=…                            → { logo:{…}|null, paymentQr:{…}|null }
GET    /api/pos/media/:kind    ?branchId=…                            → { kind, mimeType, width, height, dataUri, updatedOn, updatedBy }
DELETE /api/pos/media/:kind    ?branchId=…                            → 204
```

`kind ∈ { 'logo', 'paymentQr' }` — an enum in one constant, so a third kind (a signature image, say) is one line later.

**Server-side limits, enforced not assumed:** MIME in `{image/png, image/jpeg}`; decoded bytes ≤ **512 KB**; width ≤ **1024 px**. The client downscales through a `<canvas>` before upload (to 384 px wide for print) so a phone photo never reaches the wire at full size. Dimensions are parsed from the PNG/JPEG header — a ~40-line pure function, no image library.

**Thermal printing:** `utils/escpos.js` has **no raster support** — its encoder exposes `init/align/bold/invert/size/line/centre/row/rule/feed/cut` and nothing else. We add one method, `raster(bitmap)`, emitting `GS v 0` (`0x1D 0x76 0x30`). Monochrome conversion (greyscale → Floyd–Steinberg dither → 1-bit packed rows) happens **client-side at print time via `<canvas>`**, so no server-side image library and no second stored representation. ~80 lines in a new `utils/escposImage.js`.

> **Trade-off to accept:** a logo adds ~1–3 KB per receipt over Bluetooth LE, which on a slow link is a visible pause before the paper moves. Mitigation: cache the converted bitmap per format-fetch, and default `logo` to `never` (as it already is).

### D2 — How do the nine "show / don't show on receipt" fields work?

**They use the mechanism that already exists.** This is the cheap half of your request.

```
                  THE EXISTING SEAM  (receipt.format.service.js)
                  ─────────────────────────────────────────────
   VALUES                                    VISIBILITY
   shop{} — what to print                    documents.bill{} — whether to print
   read from the owning record               read from the catalogue + pos_setting overrides
        │                                             │
        └──────────────────┬──────────────────────────┘
                           ▼
              Receipt.js / escposReceipt.js
              present(format, 'fssai', shop.fssai)
```

So each of your nine fields is:

1. **one** `vis()` or `conditional()` entry in `receipt.catalogue.js` → the editor, the validator, the API contract and the "reset to default" affordance all appear **with zero UI code**;
2. **one** key in `shopOf()`;
3. **one** line in each of the two renderers.

The only structural change: `readBranch()` currently reads `branchdetail` + `addressdetail`. It must also join `organizationdetail` and `contactdetail`. **One query.**

**Defaults — every new field starts `never`.** No existing tenant's paper changes on deploy. That is non-negotiable: the alternative silently reprints every bill in the business with new lines on it.

### D3 — Where does "see and update what I entered at onboarding" live?

A new **Business Profile** screen at `/frontdesk/business-profile`. Rationale and layout in §8.

Your instinct — *"most of those information is for receipt and reports as well. Kind of configurations"* — is right, and it argues for the POS settings area rather than Master Data. Master Data is a generic CRUD grid over raw tables (`GenericCrudPage.js`); it shows `AddressDetailId` as a dropdown of GUIDs. It is a developer's tool. **A business owner asking "what did I type during setup?" should not have to know that their address is a foreign key.**

---

## 5. Validation derived from the DB — the "do this in general" fix

You asked for this repo-wide, not just Step 2.

### 5.1 Every mismatch I found

| Field | Wizard / Joi max today | DB column | Action |
| --- | --- | --- | --- |
| `organization.Name` | 200 | `organizationdetail.Name` **VARCHAR(100)** | → 100 |
| `branch.Name` | 200 | `branchdetail.BranchName` **VARCHAR(50)** | → 50 |
| `BranchName` (branch CRUD) | 100 | same **VARCHAR(50)** | → 50 |
| `contact.FirstName` | 100 | `contactdetail.FirstName` **VARCHAR(50)** | → 50 |
| `contact.LastName` | 100 | `contactdetail.LastName` **VARCHAR(50)** | → 50 |
| `category.Name` | 100 | `categorydetail.Name` **VARCHAR(50)** | → 50 |
| `uom.UnitName` | 100 | `UOM.UnitName` **VARCHAR(50)** | → 50 |
| `taxGroup.Name` | 100 | `taxgroup.Name` **VARCHAR(50)** | → 50 |
| `contactAddressType.Name` | 100 | `contactaddresstype.Name` **VARCHAR(50)** | → 50 |
| `address.City` / `State` / `Pincode` | **unvalidated** | `addressdetail.*` **VARCHAR(50)** | → 50 ⚠️ see below |
| `item.Code` | **unvalidated** | `itemdetail.Code` **VARCHAR(50)** | → 50 |
| `address.AddressLine1` | 50 | **VARCHAR(50)** | ✅ already correct |
| `address.TagName` | 100 | **VARCHAR(100)** | ✅ |
| `item.Name` | 200 | **VARCHAR(255)** | ✅ |
| `branch.GSTIN` | pattern-bound to 15 | **VARCHAR(50)** | ✅ |

> ⚠️ **City, State, Pincode and `item.Code` are not validated server-side at all today.** `addressSchema` in `mastersetup.schemas.js` declares only `AddressLine1`, `TagName`, `contactAddressType` and `locationMapper`; the rest ride through on `.unknown(true)` straight to `prepareInsertParams`. That is the same mechanism that swallows `Email`. **This is a new finding, not in the audit.**

### 5.2 Why this matters more than it looks

Neither repo sets `sql_mode` (grepped `src/config/`, `scripts/`, `database/`). Behaviour is the server default:

- MySQL 8 default `STRICT_TRANS_TABLES` → a 61-character branch name is a **500 with the whole bootstrap rolled back**. The user sees "Failed to create master data. Nothing was saved." and no reason.
- Non-strict → **silent truncation**, and the truncated name prints on every bill forever.

Neither is acceptable, and which one you get depends on a server setting nobody in the repo controls.

### 5.3 Approach — one shared source for field limits

Rather than hand-editing ~15 numbers across four schema files and hoping they stay in step, I propose a single constant map, mirroring how `gstinSchema.js` already centralises the GSTIN rule (*"Three copies of a pattern is how one of them ends up accepting a pasted phone number"*).

```
src/utils/fieldLimits.js         ← NEW. One object: table → column → max length.
                                   Derived by hand from 01-schema-definition.sql,
                                   with a comment pointing at the line number.

  const LIMITS = {
    organizationdetail: { Name: 100 },
    branchdetail:       { BranchName: 50, TINNo: 50, PAN: 50, GSTIN: 50, FSSAI: 20 },
    addressdetail:      { AddressLine1: 50, AddressLine2: 50, City: 50, State: 50,
                          Pincode: 50, Landmark: 50, TagName: 100 },
    contactdetail:      { FirstName: 50, LastName: 50, MobileNo: 50, AltMobileNo: 50,
                          Landline1: 50, LandLine2: 50, Email: 100 },
    ...
  }
  const str  = (table, col) => Joi.string().trim().max(LIMITS[table][col])
  const maxOf = (table, col) => LIMITS[table][col]      // exported for the UI
```

Then every schema reads `str('branchdetail','BranchName')` instead of a literal.

**And the frontend consumes the same numbers** — this is the part that makes the UI match. Two candidate routes:

| Route | How | Verdict |
| --- | --- | --- |
| **Serve them** | new `GET /api/master-data/field-limits` → the wizard sets each `maxLength` from the response | ✅ **Recommended.** One source, provably in step, and the input physically cannot overflow |
| Mirror them | a matching `src/constants/fieldLimits.js` in the frontend | ⚠️ Works, but is a second copy — the exact failure mode the backend comment warns about |

**Optional hardening (recommend yes):** add a boot-time check to `src/config/schemaCheck.js` that reads `information_schema.COLUMNS` and logs loudly if any `LIMITS` entry disagrees with the live database. That turns "the constants drifted from the schema" from a silent production truncation into a startup log line. ~30 lines, and it fits the file's stated purpose exactly (*"a smoke alarm, not a schema validator"*).

### 5.4 Behaviour in the UI

- `maxLength` on every input — typing simply stops. No error state for a problem the user cannot create.
- A live counter (`46 / 50`) appears only past 80% of the limit, so the common case stays quiet.
- Paste over the limit truncates and shows a one-line note rather than silently dropping characters.

---

## 6. Data model & API changes

### 6.1 Migration — `database/migrations/001-tenant-profile.sql`

> **Note:** `database/migrations/` **does not exist yet.** `scripts/run-migration.js` is written and documented but has never had a file to run. This would be the project's first migration — worth knowing, because the runner is untested against real input.

```sql
-- Re-runnable. Each ALTER guarded, because DDL in MySQL does not roll back.

-- 1) Compliance + identity numbers, beside the GSTIN that already lives here.
ALTER TABLE branchdetail   ADD COLUMN IF NOT EXISTS FSSAI       VARCHAR(20)  NULL;
-- PAN and TINNo already exist. CF1–CF4 already exist and stay unused.

-- 2) The email the wizard has always asked for and never stored.
ALTER TABLE contactdetail  ADD COLUMN IF NOT EXISTS Email       VARCHAR(100) NULL;

-- 3) Branch media. One row per (tenant, branch, kind).
CREATE TABLE IF NOT EXISTS pos_branch_media (
    Id              VARCHAR(50)   NOT NULL,
    TenantId        VARCHAR(50)   NOT NULL,
    BranchDetailId  VARCHAR(50)   NOT NULL,
    -- 'logo' | 'paymentQr'. A VARCHAR, not an ENUM: adding a third kind must
    -- not need a migration, and the enum lives in one constant in code.
    Kind            VARCHAR(20)   NOT NULL,
    MimeType        VARCHAR(50)   NOT NULL,
    Width           INT           NULL,
    Height          INT           NULL,
    ByteSize        INT           NOT NULL,
    -- The image itself. LONGBLOB rather than a path: there is no static file
    -- server and no object store, and a path to a file an ephemeral host has
    -- already thrown away is worse than no logo.
    Bytes           LONGBLOB      NOT NULL,
    Active          TINYINT(1)    NOT NULL DEFAULT 1,
    CreatedOn       DATETIME, CreatedBy VARCHAR(50),
    UpdatedOn       DATETIME, UpdatedBy VARCHAR(50),
    PRIMARY KEY (Id),
    UNIQUE KEY uk_branchmedia (TenantId, BranchDetailId, Kind)
);

-- 4) OPTIONAL — see §8.4 before approving this one.
ALTER TABLE tenant_setup ADD COLUMN IF NOT EXISTS bootstrap_snapshot JSON NULL;
```

Plus, in `src/config/schemaCheck.js` → `REQUIRED_COLUMNS`:

```js
branchdetail:  ['FSSAI'],
contactdetail: ['Email'],
pos_branch_media: ['Kind', 'Bytes'],
```

so a stale database says so at boot instead of 500-ing on the first save.

> **`ADD COLUMN IF NOT EXISTS` is MariaDB syntax and is NOT supported by MySQL 8.** The migration will use the portable form — an `information_schema` guard per statement, or a `PREPARE`/`EXECUTE` block. I'll write it whichever way suits your actual engine; **❓ which is it, MySQL 8 or MariaDB?** (§15-Q1). The `Aiven` reference in `run-migration.js` suggests a managed MySQL.

### 6.2 New backend module — `src/modules/posmedia/`

| File | Contents |
| --- | --- |
| `posmedia.routes.js` | 4 routes. Reads `POS_REFERENCE_READ` (a till must fetch the logo to print it — same reasoning as `receipt.format.routes.js`). Writes `POS_CONFIG_WRITE \| ORGANIZATION_WRITE \| TENANT_ADMIN` (branding is a business-details act, mirroring the GSTIN endpoint's scope choice). |
| `posmedia.schemas.js` | Joi: `kind` enum, `dataUri` pattern + max length |
| `posmedia.controller.js` | thin, `asyncHandler` + `validateBody` |
| `posmedia.service.js` | decode, validate magic bytes, cap size, parse dimensions, upsert, delete |
| `posmedia.imagemeta.js` | ~40 lines: PNG IHDR and JPEG SOF parsing. No dependency. |

Registered in `src/config/routes.js` as `app.use('/api/pos/media', posmediaRoutes)`.

**Security notes that belong in the plan, not discovered later:**
- Validate **magic bytes**, not the declared MIME. A `.png` that is actually an HTML file with a `<script>` in it must be rejected at upload, because the browser receipt renders it in an `<img>`.
- Serve with `Content-Type` from the stored `MimeType` and `X-Content-Type-Options: nosniff`.
- `ByteSize` and `Width`/`Height` are recomputed server-side, never trusted from the client.
- Every write is `auditLog(AUDIT_CATEGORIES.POS, 'INFO', …)`, consistent with the rest of POS config.

### 6.3 Modified backend files

| File | Change |
| --- | --- |
| `src/modules/mastersetup/mastersetup.schemas.js` | 11 new optional fields; all maxima via `fieldLimits`; **City/State/Pincode/Code declared explicitly** so they stop riding `.unknown(true)` |
| `src/modules/mastersetup/mastersetup.service.js` | after the branch insert, conditionally: upsert `pos_tax_setting` (if the GST answer was given) and insert up to 2 `pos_branch_media` rows — **inside the same transaction** |
| `src/modules/branchdetail/branchdetail.service.js` | map `FSSAI` in both `prepareInsertParams` and `prepareUpdateParams` |
| `src/modules/branchdetail/branchdetail.schemas.js` | `FSSAI` field; maxima from `fieldLimits` |
| `src/modules/contactdetail/contactdetail.service.js` | map `Email` in both prepare methods |
| `src/modules/contactdetail/contactdetail.schemas.js` | `Email: Joi.string().email().max(100).allow('', null)` |
| `src/modules/posreceipt/receipt.catalogue.js` | **9 new entries** across bill + credit-note headers/footers |
| `src/modules/posreceipt/receipt.format.service.js` | `readBranch()` joins `organizationdetail` + `contactdetail`; `shopOf()` returns the widened masthead |
| `src/config/constants.js` | queries for `pos_branch_media`, the widened `readBranch`, `MEDIA_KINDS` |
| `src/config/schemaCheck.js` | new `REQUIRED_COLUMNS` entries + the optional `fieldLimits` cross-check |
| `src/config/routes.js` | mount `/api/pos/media` |
| `src/config/swagger.js` | document the 4 media routes |

### 6.4 Cache invalidation (audit K-8)

Adding nine fields makes stale-format staleness materially worse: a till open since morning would print yesterday's logo, address and FSSAI.

| Option | Verdict |
| --- | --- |
| **Re-fetch on `window` focus + a 10-minute soft TTL in `usePrintReceipt`** | ✅ **Recommended.** ~15 lines, no backend change, no polling. A till that never loses focus still refreshes on the TTL |
| `ETag`/`If-None-Match` on `GET receipt-format` | ⚠️ Correct but more moving parts; worth it only if payload size becomes a problem — which it will once a logo data URI is in there. **See below.** |
| WebSocket / SSE push | ❌ Far too much for this |

> **Payload consequence worth deciding now:** if `shop{}` carries the logo and QR as data URIs, `GET /api/pos/receipt-format` grows from ~2 KB to potentially ~500 KB, and `usePrintReceipt` fetches it on every branch change. **Recommendation: `shop{}` carries only `logoUrl`/`paymentQrUrl` pointing at `GET /api/pos/media/:kind`**, and the browser caches those two responses normally (`Cache-Control` + `ETag`). Keeps the format call small and makes image caching the browser's job rather than ours. ❓ §15-Q2.

### 6.5 New/changed API surface

| Method | Route | Purpose | Scope |
| --- | --- | --- | --- |
| `POST` | `/api/pos/media?branchId=` | upload / replace | `POS_CONFIG_WRITE \| ORGANIZATION_WRITE \| admin` |
| `GET` | `/api/pos/media?branchId=` | both kinds' metadata | `POS_REFERENCE_READ` |
| `GET` | `/api/pos/media/:kind?branchId=` | one image (bytes or data URI) | `POS_REFERENCE_READ` |
| `DELETE` | `/api/pos/media/:kind?branchId=` | remove | `POS_CONFIG_WRITE \| ORGANIZATION_WRITE \| admin` |
| `GET` | `/api/master-data/field-limits` | DB-derived maxima for the UI | authenticated |
| `GET` | `/api/business-profile` | **one read** assembling org + branch + address + contact + tax + media + "what prints" | `ORGANIZATION_READ \| POS_CONFIG_READ \| admin` |
| `PUT` | `/api/business-profile` | **one transactional write** across the four records | `ORGANIZATION_WRITE \| POS_CONFIG_WRITE \| admin` |
| `POST` | `/api/master-data/bootstrap` | *(existing)* + 11 optional fields, + GST, + media | unchanged |
| `PUT` | `/api/pos/receipt-format` | *(existing)* + 9 new catalogue fields, **no code change** | unchanged |

> **§15-Q3 — `/api/business-profile` is a judgement call.** A single aggregate endpoint means the screen is one read and one atomic write, and a half-saved business profile is impossible. But it is a new façade over four modules that already have CRUD. The alternative is the screen orchestrating 4 reads and up to 4 sequential writes, where the third can fail after the second succeeded. **I recommend the aggregate**, and it also gives audit K-7 its single validated door for GSTIN. Your call.

---

## 7. The onboarding wizard's new shape

### 7.1 The problem with adding 11 fields

The wizard today asks for **7 visible required fields** and gets a tenant working. The code is emphatic that this was hard-won:

> *"'Where should your invoice numbers start' is not a question a new tenant can answer, and it was the last thing standing between them and a working branch."* — `MasterDataSetup.js:59`

Your list adds eleven more. Done naively, Step 2 becomes a 15-field wall, and the completion rate of a one-time signup wizard is exactly the thing that wall costs you.

### 7.2 Recommended shape — progressive disclosure

Required fields stay exactly where they are. Optional ones move behind **one collapsed panel per step**, closed by default.

```
┌─ Step 2 · Branch ─────────────────────────────────────────────┐
│                                                               │
│  Outlet name *          [________________________]  0/50      │
│  GSTIN                  [_______________]  optional           │
│  Address line 1 *       [________________________]            │
│  City  [__________]  State [__________]  Pin [______]         │
│  Contact first name *   [______________]                      │
│  Contact last name  *   [______________]                      │
│                                                               │
│  ▸ Add more business details (optional)            ⓘ          │
│    ───────────────────────────────────────────────            │
│    Everything here can also be set later at                   │
│    POS → Business Profile. Nothing is required now.            │
│                                                               │
│    Legal / group name   [__________________]  ⓘ               │
│    PAN  [__________]    TIN [__________]      ⓘ               │
│    FSSAI licence        [__________________]  ⓘ               │
│    Mobile [__________]  Landline [_________]  ⓘ               │
│    Email  [__________________________]        ⓘ               │
│    Address line 2 [______________]  Landmark [______]  ⓘ      │
│                                                               │
│  ▸ Branding (optional)                             ⓘ          │
│    Logo         [ Choose image ]  (none)      ⓘ               │
│    Payment QR   [ Choose image ]  (none)      ⓘ               │
│                                                               │
│  ▸ Tax (optional)                                  ⓘ          │
│    Do you charge GST?  ( ) Yes, I'm registered                │
│                        ( ) No — composition scheme            │
│                        ( ) No — not registered                │
│                        (•) Decide later  (default: charging)  │
│                                                       ⓘ       │
│                                            [ Back ] [ Next ▸ ]│
└───────────────────────────────────────────────────────────────┘
```

**Every ⓘ is the tooltip you asked for**, and it names the exact later destination. Copy is generated from one map so the wizard and the Business Profile screen cannot disagree about where a field lives:

| Field | Tooltip text |
| --- | --- |
| Legal / group name | *Your registered company or group name. Change later at **POS → Business Profile → Business**. Printed on bills only if you switch it on at **Receipt Format → Bill → Header**.* |
| GSTIN | *Change later at **POS → Business Profile → Tax & Compliance**. Each invoice keeps the GSTIN it was issued under.* |
| PAN / TIN | *Change later at **POS → Business Profile → Tax & Compliance**. Not printed unless switched on at **Receipt Format**.* |
| FSSAI licence | *Displaying it is a licence condition for most food businesses. Change later at **POS → Business Profile → Tax & Compliance**; switch printing on at **Receipt Format → Bill → Header**.* |
| Mobile / Landline | *Change later at **POS → Business Profile → Address & Contact**. Print on bills via **Receipt Format → Bill → Header → Phone**.* |
| Email | *Change later at **POS → Business Profile → Address & Contact**.* |
| Address line 2 / Landmark | *Change later at **POS → Business Profile → Address & Contact**. Included in the printed address when set.* |
| Logo | *Monochrome prints best; max 384px wide. Change later at **POS → Business Profile → Branding**; switch on at **Receipt Format → Bill → Header → Logo**.* |
| Payment QR | *A static UPI QR from your bank or PSP. Change later at **POS → Business Profile → Branding**; switch on at **Receipt Format → Bill → Footer → Payment QR**.* |
| GST charging | *Change any time at **POS → Business Profile → Tax & Compliance** (or **POS Settings → GST**). You'll be asked to settle open orders first.* |

### 7.3 Where each field lands

| Wizard field | Payload path | Destination |
| --- | --- | --- |
| Legal / group name | `organization.Name` | `organizationdetail.Name` — **already collected, just relabelled** |
| Outlet name | `branch.Name` | `branchdetail.BranchName` |
| PAN | `branch.PAN` | `branchdetail.PAN` *(column exists)* |
| TIN | `branch.TINNo` | `branchdetail.TINNo` *(column exists)* |
| FSSAI | `branch.FSSAI` | `branchdetail.FSSAI` **(new column)** |
| Mobile | `branch.contact.MobileNo` | `contactdetail.MobileNo` *(column exists)* |
| Landline | `branch.contact.Landline1` | `contactdetail.Landline1` *(column exists)* |
| Email | `branch.contact.Email` | `contactdetail.Email` **(new column)** |
| Address line 2 | `branch.address.AddressLine2` | `addressdetail.AddressLine2` *(column exists)* |
| Landmark | `branch.address.Landmark` | `addressdetail.Landmark` *(column exists)* |
| Logo | `branch.media.logo` (data URI) | `pos_branch_media` **(new table)** |
| Payment QR | `branch.media.paymentQr` | `pos_branch_media` **(new table)** |
| GST answer | `taxSetting.{gstCharging,offReason}` | `pos_tax_setting` + `pos_tax_mode_history` |

> **Seven of the thirteen need no schema change at all** — `PAN`, `TINNo`, `MobileNo`, `Landline1`, `AddressLine2`, `Landmark` and the org name are already columns the wizard simply never asked about.

### 7.4 Transaction integrity

All of it stays inside the existing `withTransaction`, in this order:

```
  … existing steps 1 → 2c (org, address, contact, numbering, branch) …
  2c′  pos_tax_setting UPSERT   + pos_tax_mode_history INSERT   ← only if answered
  2c″  pos_branch_media INSERT × 0–2                            ← only if uploaded
  2e   provisionPosMasters()                                     (unchanged)
  3    item subtree                                              (unchanged)
  4    tenant_setup COMPLETED                                    (unchanged)
```

**"Decide later" writes no `pos_tax_setting` row**, preserving the deliberate *no row = charging* default (`01-schema-definition.sql:2480`). Only an explicit answer writes one. This matters: writing `GstCharging=1` on every signup would look identical today and diverge the moment the default changes.

**A rejected image must not roll back the tenancy.** Validation runs *before* `withTransaction` opens, so "your logo was too large" is a 400 with nothing attempted, not a rolled-back signup.

### 7.5 What stays out of the wizard

| Field | Why |
| --- | --- |
| Invoice numbering | Existing deliberate decision. Not reopening it. |
| Branch tax mode (`receipt.taxMode`) | Derived from the GSTIN; the override exists only for composition, which the GST question already captures |
| Receipt field visibility (the 9 toggles) | Belongs on Receipt Format. Asking a new tenant to lay out a bill before they have sold anything is the numbering mistake again |
| HSN / SAC | Per-item, not per-tenant — belongs in the CSV import (§13.4) |

---

## 8. Business Profile — the answer to "where can I see and change what I entered?"

This is the part of your message I'd most like you to react to, because it is the most design-dependent.

### 8.1 Placement

| Candidate | Verdict |
| --- | --- |
| **New POS tab `/frontdesk/business-profile`, in the sidebar's settings group** | ✅ **Recommended.** It sits beside POS Settings and Receipt Format, which is where its neighbours already are, and matches your read that this is "kind of configurations" |
| Extend Master Data → Branch Details | ❌ `GenericCrudPage` renders FK dropdowns of GUIDs. Wrong audience |
| A section inside POS Settings | ⚠️ Workable, but POS Settings is already four cards long and is per-branch operational config |
| A top-level `/business` route | ⚠️ Discoverable, but splits "configuration" across two navigation trees |

Cross-links so there is one obvious path from wherever the user already is:
- POS Settings → GST card → *"Manage all business details →"*
- Receipt Format → each masthead field's `changeAt` label → the matching Business Profile tab
- Master Data → Branch Details / Organizations → a banner: *"Editing raw records. For a guided view, use Business Profile."*

### 8.2 Layout

```
POS ▸ Business Profile                              Branch: [ Central ▾ ]

┌────────────────────────────────────────────────────────────────────────┐
│ Business │ Address & Contact │ Tax & Compliance │ Branding │ On the bill│
└────────────────────────────────────────────────────────────────────────┘

  ── Business ─────────────────────────────────────────────────────────
                                                    ┌────────────────┐
   Legal / group name                                │ Set at setup  │
   [ Sharma Hospitality Pvt Ltd     ]  38/100        │  22 Sep 2026  │
   ⓘ Not printed on bills unless switched on         │  +9198…3210   │
      → On the bill                                  └────────────────┘

   Outlet name                                       ┌────────────────┐
   [ Central                        ]  7/50          │ Set at setup  │
   ✓ Printed on every bill                           └────────────────┘

   Invoice numbering   INV-0001 onward · next INV-0143
   ⓘ Change at Master Data → Transaction Type Configs

                                          [ Discard ]  [ Save changes ]
```

Five tabs, mapped to the records behind them:

| Tab | Fields | Records |
| --- | --- | --- |
| **Business** | Legal/group name · Outlet name · (read-only) invoice numbering | `organizationdetail`, `branchdetail`, `transactiontypeconfig` |
| **Address & Contact** | Line 1 · Line 2 · City · State · Pincode · Landmark · Contact first/last · Mobile · Landline · Email | `addressdetail`, `contactdetail` |
| **Tax & Compliance** | GSTIN *(validated, with state name)* · PAN · TIN · FSSAI · **the GST switch + its history** | `branchdetail`, `pos_tax_setting`, `pos_tax_mode_history` |
| **Branding** | Logo upload/preview/replace/remove · Payment QR upload/preview/replace/remove | `pos_branch_media` |
| **On the bill** | **Read-only** "what prints today", per document, each row linking into Receipt Format | resolved format |

### 8.3 The three design choices that make this answer your actual question

**1. A provenance badge on every field.** *"Set at setup · 22 Sep 2026 · +9198…3210"* or *"Changed 14 Oct · Priya"*. You asked *"which information had they provided during onboarding, how can they access it"* — a badge answers it inline, on the field itself, rather than in a separate history screen nobody opens.

**2. The "On the bill" tab closes the loop.** The single most confusing thing in the audit was that a field can be *stored* and *not printed*, and nothing on screen says which. This tab is a live rendering of the resolved format:

```
  ── On the bill ──────────────────────────────────────────────────────

   BILL                                                    [ Edit layout → ]

   ✓  Outlet name          Central                         always
   ✓  Address              12 MG Road, Bengaluru, 560001   always
   ✓  GSTIN                29ABCDE1234F1Z5                 always  🔒 tax invoice
   ✗  Legal name           Sharma Hospitality Pvt Ltd      never   → switch on
   ✗  FSSAI                11223344556677                  never   → switch on
   ✗  Phone                +91 98xxx x3210                  never   → switch on
   ✗  PAN                  ABCDE1234F                       never   → switch on
   ✗  Logo                 (uploaded 22 Sep)                never   → switch on
   ✗  Payment QR           (uploaded 22 Sep)                never   → switch on
   —  Email                (not set)                        never

   🔒 = locked by a rule. Hover for why.
```

Every `✗` is a stored value not reaching paper. Every `→ switch on` is one click into Receipt Format. **This is the screen that would have made the whole audit unnecessary.**

**3. Live receipt preview in the Branding tab.** `ReceiptFormat.js:361` already renders `<Receipt … inline />` against sample data. Reusing it for the logo/QR preview means a user sees the logo *on a bill*, at print scale, in mono — not as a hopeful thumbnail. Zero new rendering code.

### 8.4 Optional — the onboarding snapshot

You asked how a customer knows *"which information he had provided during onboarding"*. The provenance badge gives the *when* and *who* from `CreatedOn`/`CreatedBy`, which every table already carries. That covers the common case with no schema change, and **I recommend starting there**.

If you want the literal original submission — *"here is exactly what you typed on 22 Sep"* — that needs the payload stored: `tenant_setup.bootstrap_snapshot JSON` (in §6.1, marked optional).

**The trade-off, stated plainly:** the audit's §L warned against second homes for the same fact. This is the acceptable kind — **immutable, read-only, never a source for anything**, exactly like `transactiondetaillog`'s document snapshots. It becomes a problem only if any code ever *reads* it to populate a form. If we build it, the rule is one line in the column comment: *"Never read for anything but display."*

❓ §15-Q4 — worth it, or is the provenance badge enough?

### 8.5 Frontend files

| File | New/changed |
| --- | --- |
| `src/pages/frontdesk/BusinessProfile.js` | **NEW** — tab shell |
| `src/pages/frontdesk/businessProfile.css` | **NEW** |
| `src/components/frontdesk/BusinessProfileTabs/*.js` | **NEW** — 5 tab bodies |
| `src/components/frontdesk/MediaUploadCard.js` | **NEW** — reused for logo + QR, and by the wizard |
| `src/utils/imageDownscale.js` | **NEW** — canvas downscale + validate before upload |
| `src/utils/escposImage.js` | **NEW** — mono dither + `GS v 0` packing |
| `src/utils/escpos.js` | + `raster()` |
| `src/utils/escposReceipt.js` | + logo, QR and 7 masthead lines |
| `src/components/frontdesk/receipt/Receipt.js` | + logo `<img>`, QR `<img>`, 7 masthead lines |
| `src/services/posService.js` | + 4 media calls, + 2 business-profile calls |
| `src/pages/MasterDataSetup.js` | + 3 collapsible panels, tooltips, media upload, DB-derived `maxLength` |
| `src/components/frontdesk/FrontDeskSidebar.js` | + nav entry |
| `src/App.js` | + route with `ScopeGuard` |
| `src/pages/frontdesk/PosSettings.js` | + cross-link |
| `src/constants/routes.js` | + `BUSINESS_PROFILE` |

---

## 9. Receipt catalogue additions

All nine of your §C.3 items, plus the three dead fields repaired. **Every one defaults to `never`.**

| Catalogue key | Label | Doc(s) | Default | Value source | Notes |
| --- | --- | --- | --- | --- | --- |
| `logo` | Logo | bill, creditNote | `never` | `pos_branch_media['logo']` | **Repairs a dead field** — renderer added |
| `legalName` | Legal / group name | bill, creditNote | `never` | `organizationdetail.Name` | **NEW** — resolves audit K-4 |
| `fssai` | FSSAI licence | bill, **creditNote** | `never` ⚠️ | `branchdetail.FSSAI` | **Repairs a dead field**; added to credit note (audit K-9) |
| `pan` | PAN | bill, creditNote | `never` | `branchdetail.PAN` | **NEW** |
| `tin` | TIN | bill, creditNote | `never` | `branchdetail.TINNo` | **NEW** |
| `phone` | Phone | bill, creditNote | `never` | `contactdetail.MobileNo` ∥ `Landline1` | **NEW** — your "branch phone on receipt" |
| `email` | Email | bill, creditNote | `never` | `contactdetail.Email` | **NEW** |
| `contactName` | Contact person | bill, creditNote | `never` | `contactdetail.First + Last` | **NEW** — ⚠️ see below |
| `upiQr` | Payment QR | bill footer | `never` | `pos_branch_media['paymentQr']` | **Repairs a dead field** |

> ⚠️ **`fssai` default changes from `always` to `never`.** It is `always` today *only because the value is always empty*, so nothing prints. The moment a licence number can exist, `always` would start printing on every bill of every tenant on deploy day, unasked. **Changing the default is the safe move, and it is a behaviour change I want you to sign off** (§15-Q5).

> ⚠️ **`contactName` — I'd question this one.** You listed "Contact First/Last name" as printable. On a customer bill, a line reading *"Priya Raman"* with no label is ambiguous — is that the customer, the cashier, the owner? The bill already prints `cashier`. If the intent is "the person to call about this bill", `phone` carries that better. **Recommendation: build it (it's one catalogue line) but default `never` and label it explicitly, e.g. `Contact: Priya Raman`.** ❓ §15-Q6.

**Lock interactions to get right:**
- `legalName`, `pan`, `tin`, `phone`, `email`, `contactName` need **no** lock — they are informational, never statutory.
- `fssai` needs no lock either; it's a licence condition, not a GST rule.
- `upiQr` ⚠️ **should be locked off when the value is absent.** A footer heading with no QR under it is the `"FSSAI"`-with-no-number bug that `receiptFields.js:57` documents. Handled by `present()` for text — but an `<img>` with an empty `src` renders a broken-image icon, so the renderer must gate on the value, not only on the visibility state.

**Renderer work:** 7 text lines are one line each in both renderers. The 2 images are the real work — see D1.

---

## 10. Backward compatibility

| Concern | Assessment |
| --- | --- |
| Existing tenants' bills change? | **No.** Every new catalogue field defaults `never`; `fssai`'s default is deliberately moved to `never` to guarantee it |
| Existing tenants re-run the wizard? | **No.** `isSetupComplete()` → 409; `/master-setup` redirects to `/dashboard` |
| Existing rows need backfill? | **No.** All new columns nullable; every reader already uses `\|\| null` / `\|\| ''` / `present()` |
| Existing receipt overrides survive? | **Yes.** Keys are additive; no existing key is renamed. *(Renaming one would orphan every override — audit §J)* |
| Existing invoices/credit notes? | **Yes.** `transactiondetaillog` is append-only; nothing rewrites an issued document |
| A stale database (code ahead of schema)? | Caught at boot by `schemaCheck.js` with a named column, instead of an unreadable `ER_BAD_FIELD_ERROR` on first save |
| Tightening maxima breaks existing data? | ⚠️ **The one real risk.** `Joi.max()` applies to *writes*. If any live row already exceeds the new max (e.g. a 70-char `BranchName` that a non-strict MySQL truncated, or a name inserted before the limit tightened), **editing that record fails validation on a field the user did not touch.** Mitigation in §10.1 |
| Rollback? | Drop `pos_branch_media`; the two new columns are inert if unread. DDL is not transactional, so the migration is written re-runnable |

### 10.1 The tightening-maxima risk, and how to handle it

Before shipping §5, run a read-only audit query:

```sql
SELECT 'branchdetail.BranchName' AS field, COUNT(*) AS over_limit
  FROM branchdetail  WHERE CHAR_LENGTH(BranchName) > 50
UNION ALL SELECT 'organizationdetail.Name', COUNT(*)
  FROM organizationdetail WHERE CHAR_LENGTH(Name) > 100
UNION ALL SELECT 'contactdetail.FirstName', COUNT(*)
  FROM contactdetail WHERE CHAR_LENGTH(FirstName) > 50
-- … one line per entry in fieldLimits
```

If every count is 0 (likely, since the DB columns already enforce these), tighten freely. If not, the update schemas use `Joi.max()` only on **changed** values — which `prepareUpdateParams` already supports via its `data.X !== undefined ? … : existing.X` pattern.

---

## 11. Test plan deltas

Extends §M of the audit and [E2E_TEST_PLAN.md](E2E_TEST_PLAN.md).

### New scenarios

| # | Scenario | Key assertions |
| --- | --- | --- |
| **7** | Wizard with **every** optional field filled | 1 transaction; `branchdetail.FSSAI/PAN/TINNo` set; `contactdetail.Email/MobileNo/Landline1` set; `addressdetail.AddressLine2/Landmark` set; `pos_branch_media` 2 rows; `pos_tax_setting` 1 row; `pos_tax_mode_history` 1 row |
| **8** | Wizard with **no** optional field | Byte-identical DB outcome to audit Scenario 1. **`pos_tax_setting` has 0 rows** — "decide later" must not write |
| **9** | Media lifecycle | upload → `GET` returns it → re-upload replaces (still 1 row, `uk_branchmedia` holds) → `DELETE` → `GET` 404/null → receipt prints without it |
| **10** | Media rejection | 600 KB → 400 · 2048 px → 400 · `image/gif` → 400 · **a `.png` whose magic bytes are HTML → 400** · all with **nothing persisted** |
| **11** | Length validation | 51-char outlet name: input stops at 50 · a crafted 51-char API call → 400, **never a 500 or a truncation** · repeat for every `fieldLimits` entry |
| **12** | Receipt config matrix | For each of the 9 fields: `never` → absent · `always` with a value → present · `always` with **no** value → absent, **and no broken-image icon for logo/QR** · browser and ESC/POS outputs agree |
| **13** | `fssai` default migration | A tenant with existing overrides, upgraded: **no bill gains a line** |
| **14** | Business Profile round-trip | Change a field in each tab → save → `GET` reflects it → the "On the bill" tab reflects it → an open Billing tab picks it up after focus (§6.4) |
| **15** | Business Profile atomicity | Force a mid-save failure (e.g. invalid GSTIN alongside a valid name) → **nothing** persisted, not a partial profile |
| **16** | Scope enforcement | `POS_CONFIG_READ`-only user: Business Profile read-only, media upload 403 · cashier (`POS_REFERENCE_READ`): **can** `GET` media (needed to print), cannot write |
| **17** | Thermal logo print | 80mm and 58mm · logo present/absent · verify `GS v 0` bytes and that a Bluetooth timeout is reported through the existing `failedReason` path, not silently |

### Regression must-nots

- No existing bill/credit note/KOT/token slip changes for a tenant that touched nothing.
- `GET /api/pos/receipt-format` stays small (§6.4) — assert the payload is under ~10 KB with both images uploaded.
- The bootstrap remains atomic: inject a failure at each new step and assert `organizationdetail` is still empty.
- A second bootstrap still 409s.

---

## 12. Sequencing

Five phases. Each is independently shippable and leaves the app working — deliberately, so you can stop after any of them.

```
 P1  FOUNDATION                                          no user-visible change
     ├── fieldLimits.js + every schema aligned
     ├── migration 001 (FSSAI, Email, pos_branch_media)
     ├── schemaCheck entries + optional information_schema cross-check
     └── GET /api/master-data/field-limits
     ▼
 P2  FIELDS WITHOUT IMAGES                               ◄── recommended first cut
     ├── 9 optional wizard fields (no logo/QR) + tooltips + collapsible panels
     ├── contactdetail.Email + branchdetail.FSSAI mapped through
     ├── GST question in the wizard
     ├── 7 text catalogue fields + readBranch join + shopOf + both renderers
     └── receipt-format cache invalidation
     ▼
 P3  BUSINESS PROFILE                                    ◄── answers your §K question
     ├── GET/PUT /api/business-profile
     ├── the screen, 5 tabs, provenance badges
     ├── "On the bill" tab
     └── cross-links from POS Settings / Receipt Format / Master Data
     ▼
 P4  MEDIA                                               ◄── the expensive one
     ├── posmedia module + imagemeta + 4 endpoints
     ├── imageDownscale + MediaUploadCard
     ├── escpos raster() + escposImage dithering
     ├── logo + upiQr catalogue entries + both renderers
     └── wizard Branding panel
     ▼
 P5  OPTIONAL
     ├── bootstrap_snapshot + "what you entered at setup" view   (§8.4)
     ├── HSN/SAC in the CSV import                               (§13.4)
     └── SellerName/SellerAddress document snapshots             (§13.3)
```

**Why P2 before P4:** nine of your eleven fields need no image handling at all, and **seven of them need no schema change** (§7.3). P2 delivers most of the value before the single hardest piece starts. **If you only approve one phase, approve P2.**

**Why P3 before P4:** the Business Profile screen is what answers *"how can they access and update it later"*. The media tab can arrive into an existing shell.

**Dependencies:** P1 → everything. P2 → P1. P3 → P1 (P2 makes it fuller). P4 → P1 + P3's shell. P5 → independent.

---

## 13. What I'd push back on

### 13.1 Eleven fields in a one-time wizard

Covered in §7.1. The wizard's own comments record that stripping it down was a fought-for decision. My proposal keeps every field you asked for while keeping the required path at 7 fields, behind collapsed panels. **If you want them all expanded and visible by default, say so and I'll build that** — it's a one-line default in the panel component, not a rework. But I'd be recording that I advised otherwise.

### 13.2 Logo and QR *in* the wizard specifically

Uploading two images is the slowest possible step in a signup flow: file picker, downscale, preview, maybe a retry on a size error — on a phone, on restaurant wifi. And it is the one thing in your list a new tenant is *least* likely to have to hand on day one.

**Recommendation: keep both in the wizard as you asked, but behind the collapsed "Branding" panel, with the panel's own line being *"Add your logo now, or later from Business Profile — bills print fine without one."*** That is the honest framing and it costs nothing.

**A harder constraint you should know about:** the logo is only worth uploading if it *prints*, and printing it means the ESC/POS raster path (D1). Until P4 ships, an uploaded logo appears on the browser receipt and **not** on a thermal printer. If most of your users print thermally, a logo that works in preview and not on paper is worse than no logo. **So: either P4 ships as one unit (upload + browser + thermal together), or the Branding panel stays hidden behind a flag until it does.** I'd do the former.

### 13.3 Seller name/address snapshots (audit K-5) interact with this work

You didn't mention it, so I've left it out. But note the shape of what P2 creates: **nine new pieces of business identity on the paper, none of them snapshotted onto the document.** Today only GSTIN is. After P2, renaming a branch or changing an FSSAI number rewrites the masthead of every historic reprint.

For GSTIN that was judged worth snapshotting. For a legal name and an FSSAI licence on a tax document, the same argument applies at least as strongly. **Recommendation: schedule it as P5, and decide before P2 ships whether that's acceptable in the interim.**

### 13.4 HSN/SAC is cheap and currently broken

Not in your list. But every GST pack you generate today ships with empty HSN sheets (audit K-6, verified: `itemImport.js:18` has no `hsn` column). Two CSV columns and two schema lines. **Recommendation: fold into P5, or into P1 as a freebie.**

### 13.5 A static payment QR cannot carry an amount

A UPI QR from your bank or PSP encodes payee + optional fixed amount. A QR printed on a bill *before* the total is known can only be a static "pay this merchant" code — the customer types the amount. That is completely normal for Indian restaurants, and it is what `upiQr`'s existing comment assumes (*"the branch VPA as a scannable block"*).

Worth stating so nobody later expects a per-bill dynamic QR. A dynamic one would need a `qrcode` dependency and per-bill generation — **out of scope, and I'd argue against it until someone asks.**

### 13.6 Email on a bill

You listed it. It'll work. But: GST invoices don't require it, it costs a line of thermal paper on every bill, and it invites customers to email an address that may not be monitored. Default `never` means nobody gets it by accident. **No objection — just flagging that I'd leave it off.**

---

## 14. What I'd produce after your review

You said you may then ask for the UI and the workflows. That would be:

1. **Screen-by-screen mockups** — the wizard's three new panels (collapsed and expanded, mobile and desktop) and all five Business Profile tabs, in the ASCII style above or as a rendered HTML prototype you can click.
2. **Field-by-field spec** — label, placeholder, helper text, tooltip copy, validation message, empty state, `maxLength`, and mobile behaviour, per field.
3. **Workflow diagrams** — first-time onboarding (happy path + every failure branch); upload → downscale → validate → store → print; edit-and-propagate from Business Profile to paper; the GST switch with open orders.
4. **Responsive spec** — breakpoints matching the existing plain-CSS approach (no framework), since the wizard is used on phones.
5. **The `changeAt` map** — one table, every field → its Business Profile tab → its Receipt Format location, generating both the wizard tooltips and the Receipt Format lock messages, so the two can never disagree.
6. **File-by-file diff plan** — exact functions and line ranges per phase, ready to execute.

---

## 15. Questions blocking a clean build

Ordered by how much rework the wrong guess costs.

**Q1 — MySQL 8 or MariaDB?** Decides the migration's idempotency syntax (`ADD COLUMN IF NOT EXISTS` is MariaDB-only) and confirms the default `sql_mode`, which decides whether today's over-length names 500 or truncate. *(§5.2, §6.1)*

**Q2 — Does `GET /api/pos/receipt-format` carry image bytes, or URLs?** I recommend **URLs** — it keeps the till's format fetch at ~2 KB instead of ~500 KB and makes image caching the browser's problem. *(§6.4)*

**Q3 — One aggregate `/api/business-profile`, or four existing CRUD calls?** I recommend **the aggregate**: one atomic write, no half-saved profile, and it gives GSTIN a single validated door (audit K-7). *(§6.5)*

**Q4 — Store the literal onboarding submission (`bootstrap_snapshot`)?** The provenance badge covers "when and who" with no schema change. The snapshot adds "exactly what you typed". I recommend **starting without it**. *(§8.4)*

**Q5 — Approve changing `fssai`'s catalogue default from `always` to `never`?** Without this, the day FSSAI becomes storable, every tenant's bills gain a line nobody asked for. *(§9)*

**Q6 — Is `contactName` on a customer bill really wanted?** An unlabelled personal name on a bill reads ambiguously; `phone` probably carries the intent better. I'll build it either way. *(§9)*

**Q7 — Which phases do you want, and in what order?** My recommendation: **P1 → P2 → P3 → P4**, with P5 deferred. If budget is tight, **P1 + P2 alone** delivers most of what you asked for. *(§12)*

**Q8 — Expanded or collapsed optional panels in the wizard?** I recommend **collapsed**. *(§7.2, §13.1)*

---

## Appendix — every file this plan touches

### Backend — new
`src/utils/fieldLimits.js` · `src/modules/posmedia/{routes,schemas,controller,service}.js` · `src/modules/posmedia/posmedia.imagemeta.js` · `src/modules/businessprofile/{routes,schemas,controller,service}.js` · `database/migrations/001-tenant-profile.sql`

### Backend — modified
`src/modules/mastersetup/mastersetup.schemas.js` · `src/modules/mastersetup/mastersetup.service.js` · `src/modules/branchdetail/branchdetail.{service,schemas}.js` · `src/modules/contactdetail/contactdetail.{service,schemas}.js` · `src/modules/addressdetail/addressdetail.schemas.js` · `src/modules/organization/organization.schemas.js` · `src/modules/posreceipt/receipt.catalogue.js` · `src/modules/posreceipt/receipt.format.service.js` · `src/config/{constants,routes,schemaCheck,swagger}.js`

### Frontend — new
`src/pages/frontdesk/BusinessProfile.js` · `src/pages/frontdesk/businessProfile.css` · `src/components/frontdesk/BusinessProfileTabs/*.js` (5) · `src/components/frontdesk/MediaUploadCard.js` · `src/utils/imageDownscale.js` · `src/utils/escposImage.js` · `src/constants/fieldLimits.js` *(only if Q2 answers "mirror")*

### Frontend — modified
`src/pages/MasterDataSetup.js` · `src/components/frontdesk/receipt/Receipt.js` · `src/components/frontdesk/receipt/usePrintReceipt.js` · `src/utils/{escpos,escposReceipt,itemImport}.js` · `src/services/posService.js` · `src/services/masterSetupService.js` · `src/components/frontdesk/FrontDeskSidebar.js` · `src/pages/frontdesk/PosSettings.js` · `src/App.js` · `src/constants/routes.js` · `src/config/modules.js`
