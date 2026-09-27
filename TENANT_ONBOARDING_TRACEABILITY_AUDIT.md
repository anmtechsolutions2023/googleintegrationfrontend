# Tenant Onboarding — End-to-End Traceability Audit

**Scope:** `googleintegrationfrontend/tenant-auth-ui` + `googleintegrationbackend`
**Date:** 2026-09-25
**Method:** Source inspection only. Every claim below names the file it came from. No database was queried and no code was changed.

**Legend used throughout**

| Mark | Meaning |
| --- | --- |
| ✅ | Confirmed — found in code |
| ⚠️ | Partially implemented |
| ❌ | Not found / not implemented |
| ❓ | Needs clarification from you |

---

## A. Executive Summary

### The single most important finding

There is no such thing as a "tenant profile" in this system.

`database/01-schema-definition.sql:119` says it outright: *"no standalone tenants table exists."* A tenant is a bare UUID minted at `src/modules/admin/admin.service.js:193` and stamped into every row's `TenantId` column. It has no name, no address, no GSTIN, no logo and no settings of its own.

The business identity a customer actually sees lives in **`branchdetail`** — name, address (via FK), GSTIN. Everything printed on a bill is resolved from that one row plus per-branch key/value rows in `pos_setting`.

So the answer to your closing question — *"can I confidently know where that information is stored, where it is used, where it appears, and where I can update it later?"* — is **yes for five fields, no for the rest**, and the reason is that the wizard collects a business's identity into two different places with two different lifespans.

### There are two unrelated "onboardings", and they are easy to confuse

| | **User onboarding** | **Tenant onboarding** |
| --- | --- | --- |
| What it is | A person requesting access | A business setting itself up |
| Frontend | [OnboardingPage.js](tenant-auth-ui/src/pages/OnboardingPage.js) | [MasterDataSetup.js](tenant-auth-ui/src/pages/MasterDataSetup.js) |
| Route | `/onboarding` | `/master-setup` |
| Backend module | `src/modules/onboarding/` | `src/modules/mastersetup/` |
| API | `GET/PUT /api/onboarding/*` | `POST /api/master-data/bootstrap` |
| Table | `onboarding_requests` | `tenant_setup` + the whole master-data tree |
| Runs | once per person | once per tenant, enforced by 409 |

**The backend directory named `onboarding` has nothing to do with tenant onboarding.** Everything in this report about "the wizard" means `mastersetup`.

### How the wizard actually works

One screen, four steps, **one transactional API call**. [mastersetup.service.js:52](../googleintegrationbackend/src/modules/mastersetup/mastersetup.service.js#L52) inserts the entire Organization → Branch → (Address, Contact, Numbering) → Item tree bottom-up inside `withTransaction`, seeds ~15 POS/ledger master tables via `provisionPosMasters`, then marks `tenant_setup` COMPLETED **inside the same transaction**. All of it or none of it.

On success the controller re-signs the caller's JWT with `setupCompleted: true` ([mastersetup.controller.js:16](../googleintegrationbackend/src/modules/mastersetup/mastersetup.controller.js#L16)) — otherwise the user would finish the wizard and stay locked out by `requireTenantSetup` until the old token expired.

### The five headline conclusions

1. **Organization Name — the very first thing the wizard asks for — never reaches a customer document.** It is used only as a display label for the tenant in super-admin screens (`constants.js:2873`, `:2899`). The name on the bill is `branchdetail.BranchName`. ⚠️
2. **FSSAI is structurally dead.** The receipt catalogue has an `fssai` visibility field, the renderer prints `FSSAI {shop.fssai}`, and the resolver reads `pos_setting['receipt.shop.fssai']` — but **nothing anywhere writes that key**. No API, no UI, no migration. The number can never be non-empty. ❌
3. **The receipt `logo` field is equally dead** — it is in the catalogue and editable in the UI, but no renderer draws a logo and no storage exists for one. ❌
4. **The GST ON/OFF switch is well built and is *not* part of onboarding.** It lives in `pos_tax_setting` (one row per tenant, no row = charging), is edited at POS Settings → GST, is refused while orders are open, is append-only audited in `pos_tax_mode_history`, and is snapshotted per document as `transactiondetaillog.TaxMode`. ✅
5. **The wizard's Contact → Email field is silently discarded.** `contactdetail` has no Email column and `prepareInsertParams` never maps one; Joi's `.unknown(true)` lets it through validation and it vanishes. ❌

---

## B. Current Onboarding Fields — Complete Inventory

Source of truth: the `STEPS` array at [MasterDataSetup.js:22–95](tenant-auth-ui/src/pages/MasterDataSetup.js#L22) and the Joi tree at [mastersetup.schemas.js](../googleintegrationbackend/src/modules/mastersetup/mastersetup.schemas.js).

### Step 1 — Organization

| Field | Req? | Validation | DB | Used by |
| --- | --- | --- | --- | --- |
| `organization.Name` | ✅ Required | max 200, trimmed | `organizationdetail.Name` — `UNIQUE (Name, TenantId)` | Super-admin tenant directory label only |

### Step 2 — Branch

| Field | Req? | Validation | DB column | Notes |
| --- | --- | --- | --- | --- |
| `branch.Name` | ✅ Required | max 200 | `branchdetail.BranchName` | Mapped by `data.BranchName \|\| data.Name` ([branchdetail.service.js:18](../googleintegrationbackend/src/modules/branchdetail/branchdetail.service.js#L18)). **DB column is VARCHAR(50), the wizard allows 200** ⚠️ |
| `branch.GSTIN` | Optional | `gstinProblem()` client, `gstinField` server — 15 chars, real state code | `branchdetail.GSTIN` | The only tax field in the wizard |
| `branch.address.AddressLine1` | ✅ Required | max 50 | `addressdetail.AddressLine1` | |
| `branch.address.TagName` | Hidden, fixed `'Onboarding'` | — | `addressdetail.TagName` | `UNIQUE (TagName, TenantId)` |
| `branch.address.City` | Optional | — | `addressdetail.City` | Prints on the receipt |
| `branch.address.State` | Optional | — | `addressdetail.State` | Prints on the receipt |
| `branch.address.Pincode` | Optional | — | `addressdetail.Pincode` | Prints on the receipt |
| `branch.address.contactAddressType.Name` | Hidden, fixed `'Onboarding'` | — | `contactaddresstype.Name` | Reused via `getOrCreateByNameTx` |
| `branch.contact.FirstName` | ✅ Required | max 100 (DB is 50) ⚠️ | `contactdetail.FirstName` | |
| `branch.contact.LastName` | ✅ Required | max 100 (DB is 50) ⚠️ | `contactdetail.LastName` | |
| `branch.contact.Email` | Optional | none | **none** | ❌ **Silently dropped — see §K-1** |

Not asked for, defaulted by the API ([mastersetup.schemas.js:49–79](../googleintegrationbackend/src/modules/mastersetup/mastersetup.schemas.js#L49)):

| Field | Default | DB |
| --- | --- | --- |
| `transactionTypeConfig.StartCounterNo` | `1` | `transactiontypeconfig` |
| `transactionTypeConfig.Format` | `'INV-{0000}'` | `transactiontypeconfig` |
| `transactionTypeConfig.TagName` | `'Onboarding'` | `transactiontypeconfig`, `UNIQUE(TagName, TenantId)` |

### Step 3 — Item (optional, two mutually exclusive sources)

**Source A — one item typed in.** Rides inside the same transaction.

| Field | Req? | DB |
| --- | --- | --- |
| `item.Name` | ✅ Required | `itemdetail.Name` |
| `item.Code` | Optional | `itemdetail.Code` |
| `item.category.Name` | ✅ Required | `categorydetail.Name` |
| `item.uom.UnitName` | Hidden, fixed `'Primary'` | `UOM.UnitName` |
| `item.costInfo.Amount` | ✅ Required, numeric | `costinfo.Amount` |
| `item.costInfo.taxGroup.Name` | Optional, defaults `'Exempt (0%)'` | `taxgroup.Name` |
| `taxRates[]` (Name + Value) | Required iff group is not Exempt | `TaxTypes` + `taxgrouptaxtypemapper` |

**Source B — a CSV/paste upload.** Runs *after* the transaction commits, via `POST /api/import/items`, because the bulk endpoint sits behind the setup gate. Columns ([itemImport.js:18](tenant-auth-ui/src/utils/itemImport.js#L18)): `name, category, unit, price, tax_group, tax_components, food_type, code, description, tax_included`.

> A half-failed import does **not** fail the tenancy — [MasterDataSetup.js:349](tenant-auth-ui/src/pages/MasterDataSetup.js#L349) reports the two passes separately on purpose. ✅

### Step 4 — Review. No fields; the commit button.

### Validation behaviour

| Question | Answer | Where |
| --- | --- | --- |
| Skipped optional field? | Stripped by `clean()` before send — the key never reaches the API | `MasterDataSetup.js:301` |
| Invalid GSTIN? | Blocks `canAdvance`; server also rejects with a state-code message | `gstin.js`, `gstinSchema.js` |
| Tax group named but no rates? | Blocked client-side *and* server-side (400) | `MasterDataSetup.js:218`, `mastersetup.service.js:150` |
| Exempt group *with* rates? | Blocked both sides — a contradiction, not silently dropped | same |
| Second bootstrap attempt? | `409 TENANT_SETUP_ALREADY_DONE` | `mastersetup.service.js:56` |
| Any step fails? | Full rollback, `tenant_setup` stays PENDING | `withTransaction` |

### Fields you asked about that the wizard does NOT collect

| Field | Status | Where it lives instead |
| --- | --- | --- |
| GST enabled/disabled | ❌ not in wizard | `pos_tax_setting`, POS Settings → GST |
| FSSAI licence number | ❌ nowhere writable | — (see §E) |
| Logo | ❌ no storage at all | — (see §K-3) |
| PAN, TINNo, CF1–CF4 | ❌ not in wizard | `branchdetail`, Master Data → Branch Details |
| Contact mobile / landline | ❌ not in wizard | `contactdetail`, Master Data → Contact Details |
| AddressLine2, Landmark | ❌ not in wizard | `addressdetail`, Master Data → Address Details |
| HSN / SAC code | ❌ not in wizard *or* CSV import | `itemdetail`, Master Data → Item Details |
| Branch phone on receipt | ❌ no such catalogue field | — |
| Business legal name (vs branch name) | ❌ | `organizationdetail` is the closest, and it never prints |

---

## C. Field Propagation Matrix

Read this as: *entered here → stored here → shows up here.* "Receipt" means the customer-facing bill/credit-note/token-slip rendered by [Receipt.js](tenant-auth-ui/src/components/frontdesk/receipt/Receipt.js) and [escposReceipt.js](tenant-auth-ui/src/utils/escposReceipt.js).

| Field | Wizard | Table.Column | Write API | Read API | Where it appears | Editable later? | On receipt? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Organization Name | ✅ Step 1 | `organizationdetail.Name` | `POST /api/master-data/bootstrap`, `PUT /api/organizations/:id` | `GET /api/organizations` | Super-admin tenant directory **only** | ✅ Master Data → Organizations | ❌ **never** |
| Branch Name | ✅ Step 2 | `branchdetail.BranchName` | bootstrap, `PUT /api/branchdetails/:id` | `GET /api/pos/branches`, receipt-format | Every screen's branch picker, bill masthead | ✅ Master Data → Branch Details | ✅ `shopName` |
| GSTIN | ✅ Step 2 (optional) | `branchdetail.GSTIN` | bootstrap, `PUT /api/pos/tax-settings/branches/:id/gstin`, `PUT /api/branchdetails/:id` | receipt-format, GST export | Bill header, tax mode derivation, GST pack | ✅ **two places** — see §I | ✅ `gstin` |
| AddressLine1 / City / State / Pincode | ✅ Step 2 | `addressdetail.*` | bootstrap, `PUT /api/addressdetails/:id` | receipt-format (`CONCAT_WS`) | Bill + credit-note header | ✅ Master Data → Address Details | ✅ `address` |
| Contact First/Last name | ✅ Step 2 | `contactdetail.*` | bootstrap, `PUT /api/contactdetails/:id` | `GET /api/contactdetails` | Master Data screens only | ✅ Master Data → Contact Details | ❌ |
| Contact **Email** | ✅ Step 2 | ❌ **no column** | — | — | **nowhere** | n/a | ❌ |
| Invoice number format | ❌ (defaulted) | `transactiontypeconfig.Format` | bootstrap, `PUT /api/transactiontypeconfigs/:id` | ledger numbering | `documentNo` on every document | ✅ Master Data → Transaction Type Configs | ✅ `documentNo` |
| Starter item name/code/price | ✅ Step 3 | `itemdetail`, `costinfo` | bootstrap, `POST /api/import/items` | menu/pricing | Menu, bill lines | ✅ Master Data → Item Details, Menu Master | ✅ line items |
| Tax group + rates | ✅ Step 3 | `taxgroup`, `TaxTypes`, `taxgrouptaxtypemapper` | bootstrap | pricing engine | Tax rows on the bill | ✅ Master Data → Tax Groups | ✅ `taxRows` |
| **GST charging on/off** | ❌ | `pos_tax_setting.GstCharging` | `PUT /api/pos/tax-settings` | `GET /api/pos/tax-settings` | Pricing, document title, tax rows, GST pack | ✅ POS Settings → GST | ✅ indirectly (tax mode) |
| **GST off-reason** | ❌ | `pos_tax_setting.OffReason` | `PUT /api/pos/tax-settings` | same | Composition declaration in footer | ✅ POS Settings → GST | ✅ `compositionNote` |
| **FSSAI number** | ❌ | `pos_setting['receipt.shop.fssai']` | ❌ **none** | receipt-format `shopOf()` | nowhere (always `''`) | ❌ | ⚠️ field exists, value can't |
| **Logo** | ❌ | ❌ none | ❌ none | ❌ none | nowhere | ❌ | ❌ renderer has no logo branch |
| PAN / TINNo / CF1–4 | ❌ | `branchdetail.*` | `PUT /api/branchdetails/:id` | `GET /api/branchdetails` | Master Data grid only | ✅ Master Data → Branch Details | ❌ |
| Header/footer free text | ❌ | `pos_setting['receipt.bill.headerLine'/'footerLine1'/'footerLine2']` | `PUT /api/pos/receipt-format` | receipt-format | Bill header/footer | ✅ Receipt Format screen | ✅ |

### The five journeys that matter, drawn out

```
GSTIN
  MasterDataSetup.js  Step 2, optional, gstinProblem()
        │
        ▼
  POST /api/master-data/bootstrap      { branch: { GSTIN } }
        │  bootstrapSchema → gstinField (15 chars + real state code)
        ▼
  branchdetail.GSTIN                   VARCHAR(50)
        │
        ├──► receipt.format.service.readBranch()      → shop.gstin  → BILL HEADER
        ├──► resolveTaxMode()  GSTIN present ⇒ 'gst'  → TAX INVOICE vs BILL OF SUPPLY
        ├──► ledger settle: SELECT_BRANCH_GSTIN       → transactiondetaillog.SellerGstin  (SNAPSHOT)
        │         └──► reprint uses the SNAPSHOT via receiptFields.printedShop()   ✅
        └──► GST pack: loadBranch() + per-doc sellerGstin cross-check              ✅
  Editable later at:  POS Settings → GST  (PUT /api/pos/tax-settings/branches/:id/gstin)
                      Master Data → Branch Details  (PUT /api/branchdetails/:id)      ⚠️ two doors
```

```
GST ON / OFF                          ← never touched by onboarding
  POS Settings → GST  (GstSettingsCard.js)
        │
        ▼
  PUT /api/pos/tax-settings  { gstCharging, offReason }
        │  refused 409 TAX_SWITCH_BLOCKED while any round is open
        ▼
  pos_tax_setting  (1 row / TENANT, no row = charging)
  pos_tax_mode_history  (append-only, who + when)
        │
        ├──► pricing.service: components = gstCharging ? entry.components : []
        │         └──► pos_order line.taxCharged
        ├──► posbill settle: taxMode from the LINES, not from today's switch
        │         └──► transactiondetaillog.TaxMode   (SNAPSHOT)
        ├──► receipt.format.resolveTaxMode(): the tenant switch OUTRANKS the branch override
        │         └──► locks gstin / taxRows / compositionNote in the catalogue
        └──► gstexport: period strip "on 1–9 Sep, off 10–15 Sep" from history
```

```
FSSAI                                   ⛔ BROKEN CHAIN
  (no wizard field)
  (no settings screen)
  (no API — coerce() only accepts catalogue field keys, and possetting.schemas
   enumerates its keys; 'receipt.shop.fssai' is in neither list)
        │
        ▼
  pos_setting['receipt.shop.fssai']     ← nothing ever writes this row
        │
        ▼
  receipt.format.service.shopOf()  → shop.fssai = ''
        │
        ▼
  Receipt.js:53   present(format,'fssai','')  → false  → nothing printed
```

```
Branch Name / Address
  Wizard Step 2 → branchdetail.BranchName / addressdetail.*
        │
        ▼
  receipt.format.readBranch()  — LIVE read, every fetch
        │
        ▼
  shop.name / shop.address  → bill + credit note + token slip
        │
        └──► ⚠️ NOT snapshotted onto the document. A branch renamed today
             reprints yesterday's invoice under the new name. Only GSTIN
             is snapshotted (SellerGstin).
```

```
Organization Name
  Wizard Step 1 → organizationdetail.Name
        │
        ├──► Master Data → Organizations grid
        └──► SELECT_ALL_TENANTS / SELECT_TENANT_DIRECTORY   (super admin only)
                 (SELECT o.Name … ORDER BY o.CreatedOn ASC LIMIT 1) AS tenant_name
        │
        ▼
  ❌ Never reaches a bill, invoice, report, export or PDF.
```

---

## D. GST Flow — Complete

Answering your fourteen numbered questions directly.

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Where is the ON/OFF config stored? | `pos_tax_setting`, **one row per tenant** | `01-schema-definition.sql:2488` |
| 2 | Exact flag name? | `pos_tax_setting.GstCharging` (TINYINT), plus `OffReason` | same |
| 3 | Default value? | **No row = charging.** Column default is `1` | schema comment: *"Here, no row means charging, exactly as the system always has."* |
| 4 | Where does the tenant enable/disable? | POS Settings → GST card | [GstSettingsCard.js](tenant-auth-ui/src/components/frontdesk/GstSettingsCard.js), `/frontdesk/settings` |
| 5 | Collected during onboarding? | ❌ **No** | `mastersetup.schemas.js` has no such field |
| 6 | If not, where? | `PUT /api/pos/tax-settings`, scope `POS_CONFIG:WRITE` or tenant admin | `taxsetting.routes.js` |
| 7 | UI when ON | Receipt Format lets a branch choose `gst` / `composition` / `unregistered`; `gstin` and `taxRows` unlocked | `receipt.catalogue.js` `lockGstin`, `lockTaxRows` |
| 8 | UI when OFF | Receipt Format tax-mode picker **refuses** with `TAX_MODE_FOLLOWS_GST_SWITCH` (409); `gstin` forced NEVER, `taxRows` forced `none`, `compositionNote` forced ALWAYS if reason = composition | `receipt.format.service.js:349`, catalogue locks |
| 9 | Which APIs behave differently | `POST /api/pricing/*` (no components), `POST /api/pos/bills/:id/settle` (TaxMode), `GET /api/pos/receipt-format` (locks), `GET /api/gst/*` (period strip) | see propagation map |
| 10 | What DB values change | `pos_tax_setting` upserted **+** one row appended to `pos_tax_mode_history` in the same transaction | `taxsetting.service.js:95` |
| 11 | Invoices/receipts when ON | Title **TAX INVOICE**, GSTIN line, CGST/SGST split rows, `TaxMode='gst'`, `SellerGstin` snapshotted | catalogue + `posbill.service.js:293` |
| 12 | When OFF | Title **BILL OF SUPPLY**, no GSTIN, no tax rows; `composition` adds the statutory declaration, `unregistered` adds nothing | `lockCompositionNote` |
| 13 | Appears on… | Receipts ✅ · Invoices ✅ · Prints ✅ (both browser and ESC/POS) · Reports ✅ (Finance → GST tab) · PDFs ⚠️ no PDF generator exists — `window.print()` only · Emails ❌ no email sender exists · GST pack (.zip) ✅ | `usePrintReceipt.js`, `gstexport.service.js` |
| 14 | Enable GST later — is earlier data available? | ✅ Yes, immediately. The GSTIN already on `branchdetail` is picked up on the next `resolveTaxMode()`. Nothing is migrated because nothing was moved. | `receipt.format.service.js:70` |
| 15 | Disable later — what happens to data? | **Nothing is deleted.** Prices are not edited, tax groups are untouched, historic documents keep their own `TaxMode` and `SellerGstin`. Only *future* pricing changes. | `taxsetting.service.js` header comment |
| 16 | Can the GSTIN be updated later? | ✅ Yes, and it is not blocked by open orders — nothing is re-priced | `taxsetting.service.js:117` |
| 17 | Where exactly? | **POS Settings → GST → branch row** (`PUT /api/pos/tax-settings/branches/:branchId/gstin`), *and* **Master Data → Branch Details** (`PUT /api/branchdetails/:id`) ⚠️ | `BranchGstinList.js`, `modules.js:322` |

### Control diagram — what decides a document's tax mode

```
                    ┌──────────────────────────────────┐
                    │  pos_tax_setting.GstCharging      │   TENANT-WIDE
                    │  (no row ⇒ TRUE)                  │
                    └───────────────┬──────────────────┘
                                    │
                  FALSE ────────────┴──────────── TRUE
                    │                               │
                    ▼                               ▼
      taxModeOf(setting)                 pos_setting['receipt.taxMode']
      = OffReason ∈ {composition,         (per-BRANCH override, optional)
        unregistered}                               │
                    │                    set? ──────┴────── unset?
                    │                     │                   │
                    │                     ▼                   ▼
                    │              that mode          branchdetail.GSTIN
                    │                                 present ⇒ 'gst'
                    │                                 absent  ⇒ 'unregistered'
                    └───────────────┬───────────────────────┘
                                    ▼
                            ctx.taxMode
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
   lockGstin()              lockTaxRows()             lockCompositionNote()
   gst ⇒ ALWAYS             gst ⇒ free choice         composition ⇒ ALWAYS
   else ⇒ NEVER             else ⇒ 'none'             else ⇒ NEVER
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                                    ▼
                    applyDoc(): the LOCK overrides the stored value,
                    on every read — not just at save time.
```

> **Precedence, stated once:** tenant switch **>** branch override **>** GSTIN presence. `receipt.format.service.js:70–81`.

### Two independent GST concepts — do not conflate them

| | `pos_tax_setting.GstCharging` | `pos_setting['receipt.taxMode']` |
| --- | --- | --- |
| Scope | Tenant | Branch |
| Changes money? | ✅ Yes — pricing stops adding tax | ❌ No — paper only |
| Blocked by open orders? | ✅ Yes (409) | ❌ No |
| Audited to a history table? | ✅ `pos_tax_mode_history` | ❌ audit log only |
| Can be set while GST is off? | n/a | ❌ Refused, 409 |

---

## E. FSSAI Flow — Current Implementation + Gaps

### Everything that exists

| Piece | File | Status |
| --- | --- | --- |
| Catalogue field `fssai` (bill → header, default `always`) | `receipt.catalogue.js:124` | ✅ exists |
| Storage key constant `FSSAI_KEY = 'receipt.shop.fssai'` | `receipt.format.service.js:39` | ✅ exists |
| Read into the masthead: `fssai: stored[FSSAI_KEY] \|\| ''` | `receipt.format.service.js:98` | ✅ exists |
| Browser renderer: `FSSAI {shop.fssai}` | `Receipt.js:53` | ✅ exists |
| Thermal renderer: `e.line(\`FSSAI ${shop.fssai}\`)` | `escposReceipt.js:26` | ✅ exists |
| Visibility toggle in the Receipt Format editor | generated from the catalogue | ✅ exists |
| **Anything that WRITES the licence number** | — | ❌ **does not exist** |

### Answering your questions

- **Is FSSAI part of the onboarding wizard?** ❌ No. Not in `STEPS`, not in `bootstrapSchema`.
- **Is there anywhere else to enter it?** ❌ No. I checked all three candidate write paths:
  - `PUT /api/pos/receipt-format` → `coerce()` rejects any key not in the catalogue, and the catalogue's `fssai` entry is a *visibility* field keyed `receipt.bill.fssai`, not the value keyed `receipt.shop.fssai`.
  - `PUT /api/pos/settings` → `possetting.schemas.js` enumerates its keys (`TOKEN_NUMBERING`, `LOYALTY_RATE`, `KOT_AUTO_PRINT`, `KPT_DEFAULT_MINUTES`, `KITCHEN_NOTE_PRESETS`). Comment: *"Keys are enumerated rather than free-form."*
  - `PUT /api/branchdetails/:id` → there is no FSSAI column on `branchdetail`.
- **Which screen / API / DB field?** None, none, and a `pos_setting` row that is never created.
- **Does it appear on receipts today?** ❌ No. `present()` requires `hasValue(value)`; `''` fails, so the line is skipped. **Good news: there is no visible bug** — the field simply never prints. The renderer comment at `receiptFields.js:57` shows this was a deliberate guard after a counter ticket printed a bare `"FSSAI"` with no number.

### The honest classification

> **Not implemented.** The read half of the feature was built; the write half was not. A branch that switches FSSAI to `always` in the Receipt Format editor sees the toggle save successfully and nothing change on the paper — the worst kind of silent failure, because the settings screen reports success.

### What it would take (minimum change, no redesign)

Two options. I recommend **Option 1**.

**Option 1 — one catalogue entry + one constant (≈15 lines, no migration).**
Add `text('shopFssai', 'FSSAI licence number', '', '14-digit licence…', 14)` to the bill's header section and change `FSSAI_KEY` to `settingKey('bill','shopFssai')`. The editor, validator and API all generate themselves from the catalogue — `receipt.catalogue.js:11` says *"Adding a field is ONE entry here."* Existing tenants get `''`, exactly as today. Zero backward-compatibility risk.
*Trade-off:* the value becomes per-branch-per-document rather than per-branch. Acceptable, and arguably correct — a licence is issued per premises.

**Option 2 — a `branchdetail.FSSAI` column.**
Matches where GSTIN lives, makes it editable from both Master Data → Branch Details and POS Settings, and lets it be collected in the wizard. Costs a schema migration (`ALTER TABLE branchdetail ADD COLUMN FSSAI VARCHAR(20) NULL`), a change to `prepareInsertParams`/`prepareUpdateParams`, and a `readBranch()` change.
*Trade-off:* more surface, but it is the only option that makes FSSAI collectable during onboarding, which is what you asked about.

**Can it be added as an optional onboarding field without breaking existing tenants?** ✅ Yes, under either option — `bootstrapSchema` is additive and every node already carries `.unknown(true)`; existing tenants never re-run the wizard (409), so they are untouched.

**Where should it propagate?** Bill header (already wired), credit-note header (⚠️ the catalogue has no `fssai` field on `creditNote` — you would add one), and the GST pack README if you want a compliance cover sheet.

---

## F. UI / Page Map

### Where a tenant's information is entered, seen and changed

| Page | Route | Purpose | Tenant info shown | Editable? | API |
| --- | --- | --- | --- | --- | --- |
| Setup Wizard | `/master-setup` | One-time tenant bootstrap | Org, branch, address, contact, first item | ✅ once, then 409 | `POST /api/master-data/bootstrap` |
| Master Data → Organizations | `/master/organizations` | Org CRUD | `Name`, `Active` | ✅ | `/api/organizations` |
| Master Data → Branch Details | `/master/branchDetails` | Branch CRUD | `BranchName`, `TINNo`, **`GSTIN`**, `PAN`, `CF1–4`, FKs | ✅ | `/api/branchdetails` |
| Master Data → Address Details | `/master/addressDetails` | Address CRUD | Line1/2, City, State, Pincode, Landmark, TagName | ✅ | `/api/addressdetails` |
| Master Data → Contact Details | `/master/contactDetails` | Contact CRUD | First/Last name, MobileNo, landlines | ✅ | `/api/contactdetails` |
| Master Data → Transaction Type Configs | `/master/transactionTypeConfigs` | Invoice numbering | `StartCounterNo`, `Format`, `TagName` | ✅ | `/api/transactiontypeconfigs` |
| Master Data → Tax Groups / Tax Types | `/master/taxGroups`, `/master/taxTypes` | Rates | Group names, rate values | ✅ | `/api/taxgroups`, `/api/taxtypes` |
| **POS Settings → GST** | `/frontdesk/settings` | The GST switch **+ per-branch GSTIN** | `GstCharging`, `OffReason`, history, each branch's GSTIN | ✅ | `/api/pos/tax-settings` |
| POS Settings (rest) | `/frontdesk/settings` | Token numbering, KOT printing, kitchen notes | branch-scoped prefs | ✅ | `/api/pos/settings` |
| **Receipt Format** | `/frontdesk/receipt-format` | What prints on paper | every catalogue field + live preview | ✅ | `/api/pos/receipt-format` |
| Finance → GST tab | `/frontdesk/finance?tab=gst` | Readiness, pack download, filing record | branch GSTIN, period strip | ⚠️ GSTIN editable inline when missing | `/api/gst/*` |
| Reports home | `/reports` | Catalogue linking to existing report tabs | none | ❌ | — |
| Admin → All Users / Directory | `/admin/users` | Super-admin cross-tenant view | `tenant_name` ← org name, `setup_status` | ❌ | `/api/admin/*` |

### "Where do I go to change X?" — the answers that actually exist

> ✅ **Branch name** → Master Data → Branch Details → edit `BranchName` → Save
> ✅ **Address** → Master Data → Address Details → edit the `Onboarding`-tagged row → Save
> ✅ **GSTIN** → POS Settings → GST → branch row → type → Save *(preferred — it normalises and validates)*
> ✅ **GST on/off** → POS Settings → GST → toggle → confirm *(settle open orders first)*
> ✅ **Invoice number format** → Master Data → Transaction Type Configs → the `Onboarding` row
> ✅ **What prints on the bill** → Receipt Format → Bill → set each field
> ❌ **FSSAI number** → *No existing update path found.*
> ❌ **Logo** → *No existing update path found.*
> ❌ **Contact email** → *No existing update path found (no column).*
> ⚠️ **Organization name** → Master Data → Organizations — but it changes only a super-admin label, nothing customer-facing.

### There is no "Business Information" screen

A tenant's identity is spread across **Master Data (Organization + Contacts categories)**, **POS Settings → GST** and **Receipt Format**. Three destinations, no single "my business" page. That is the main usability gap behind your question.

---

## G. Database / API Map

### Architecture — the request path

```
BROWSER (CRA, React Router)
   │  axios  src/api/api.js   — Bearer JWT { phone, tid, scopes[], setupCompleted }
   ▼
EXPRESS  server.js → src/config/routes.js
   │
   ├─ authenticateToken            verifies JWT, populates req.user
   ├─ requireTenantSetup           ⟵ THE GATE. 403 TENANT_SETUP_REQUIRED unless
   │                                 the path is allowlisted, the caller is a
   │                                 super admin, or tenant_setup = COMPLETED
   ├─ checkScope(...)              scope strings from role_permissions
   ├─ auditLog(...)                → audit_logs
   └─ validateBody(JoiSchema)      → req.validatedBody
   ▼
CONTROLLER  (asyncHandler + responseHelper)
   ▼
SERVICE     withConnection / withTransaction
   ▼
MySQL       every table carries TenantId; every query filters on it
```

### The bootstrap transaction, in insert order

```
POST /api/master-data/bootstrap        scope: TENANT_ADMIN | TENANT_SUPER_ADMIN
   │
   ├─ 0. isSetupComplete(tenantId)?  ── yes ──► 409 TENANT_SETUP_ALREADY_DONE
   │
   └─ withTransaction:
        1.  organizationdetail                      ← organization.Name
        2a. mapprovider + locationdetail
            + mapproviderlocationmapper             ← optional, all-or-nothing
            contactaddresstype  (getOrCreateByName) ← 'Onboarding'
            addressdetail                           ← AddressLine1, City, State, Pincode, TagName
        2b. contactdetail                           ← FirstName, LastName   (Email DROPPED)
            transactiontypeconfig (getOrCreateByTag)← INV-{0000}, start 1, tag 'Onboarding'
        2c. branchdetail                            ← BranchName, GSTIN + 4 NOT NULL FKs
        2e. provisionPosMasters()                   ← payment modes, received types,
                                                      accounttypebase, statuses,
                                                      'POS Sale'/'POS Return' types,
                                                      transitions, channels, portals,
                                                      food/meat types, menu tags,
                                                      rejection + return reasons,
                                                      expense/asset categories,
                                                      'Exempt (0%)' tax group
        3.  categorydetail → UOM → taxgroup(+rates) → costinfo → itemdetail   (optional)
        4.  tenant_setup  UPSERT status='COMPLETED'  ⟵ INSIDE the transaction
   │
   └─ response: { ...idMap, setupToken }   ← JWT re-signed with setupCompleted:true
```

> **Note on step 2e:** `provisionPosMasters` does **not** create a `pos_tax_setting` row. A brand-new tenant therefore has no row, which means **GST charging is ON by default**. ✅ Verified by grep — the string `pos_tax_setting` does not appear in `posMasters.provision.js`.

### Tables touched by tenant identity

| Table | Holds | Written by |
| --- | --- | --- |
| `user_tenants` | membership, `full_name`, `branch_detail_id` | approval / invitation |
| `tenant_setup` | `status` PENDING/COMPLETED | bootstrap only |
| `organizationdetail` | business name | bootstrap, org CRUD |
| `branchdetail` | `BranchName`, **`GSTIN`**, `PAN`, `TINNo`, `CF1–4` | bootstrap, branch CRUD, GSTIN endpoint |
| `addressdetail` | the printed address | bootstrap, address CRUD |
| `contactdetail` | branch contact person | bootstrap, contact CRUD |
| `transactiontypeconfig` | invoice numbering series | bootstrap, config CRUD |
| `pos_tax_setting` | **the GST switch** | `PUT /api/pos/tax-settings` only |
| `pos_tax_mode_history` | every move of the switch | same, same transaction |
| `pos_setting` | `receipt.*` overrides, token/KOT prefs | receipt-format + possetting |
| `pos_gst_filing` | closed GST periods | `POST /api/gst/filings` |
| `transactiondetaillog` | **per-document snapshot**: `TaxMode`, `SellerGstin`, `BuyerGstin`, `BuyerLegalName` | ledger settle |

---

## H. Receipt / Invoice / Print / Report Mapping

### What each document carries

| Document | Shop name | Address | GSTIN | GST status | FSSAI | Logo | Other tenant info | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Bill** | ✅ `shopName`, locked ALWAYS | ✅ `address` | ✅ locked by tax mode | ✅ title + tax rows + declaration | ⚠️ field exists, value always `''` | ❌ toggle exists, nothing renders | invoice no., cashier, header/footer text | `GET /api/pos/receipt-format` → `shop{}` + `documents.bill{}` |
| **Credit note** | ✅ locked ALWAYS | ✅ | ✅ locked by tax mode | ✅ | ❌ **no field in the catalogue at all** | ❌ | credit-note no., "against invoice", refunded-to | same |
| **KOT** | ❌ deliberately none | ❌ | ❌ | ❌ | ❌ | ❌ | waiter, round, table/token | same |
| **Token slip** | ✅ | `never` by default | ❌ | ❌ | ❌ | ❌ | token no., item count, amount | same |
| **GST pack (.zip)** | ✅ branch name in README | ❌ | ✅ live branch GSTIN + per-doc `SellerGstin` cross-check | ✅ period strip from history | ❌ | ❌ | 11 CSVs + README | `GET /api/gst/pack` |
| **Finance / Reports tabs** | ❌ | ❌ | ❌ | ⚠️ only on the GST tab | ❌ | ❌ | branch name in filters | Finance endpoints |
| **PDF** | — | — | — | — | — | — | — | ❌ **No PDF generator exists.** "Print to PDF" is the browser's own `window.print()` |
| **Email** | — | — | — | — | — | — | — | ❌ **No email sender exists** for documents |

### Where the printed masthead actually comes from

```
usePrintReceipt(branchId)
   │  ONE fetch, held for the component's life
   ▼
GET /api/pos/receipt-format?branchId=…
   │
   ├─ readOverrides()   pos_setting WHERE SettingKey LIKE 'receipt.%'
   ├─ readBranch()      branchdetail b LEFT JOIN addressdetail a
   │                    → BranchName, GSTIN, CONCAT_WS(', ', Line1, City, State, Pincode)
   └─ taxSettingRepository.getTx()   pos_tax_setting
   ▼
{ shop: { name, address, gstin, fssai }, taxMode, documents: {...} }
   ▼
Receipt.js / escposReceipt.js
   │
   └─ printedShop(shop, data)          ← receiptFields.js:93
        data has 'SellerGstin'?  →  gstin = data.SellerGstin   ✅ SNAPSHOT honoured
        otherwise                →  gstin = today's branch GSTIN
```

> **This is correct for GSTIN and only for GSTIN.** A reprint from the Ledger spreads `...doc` (from `SELECT_LOG_FULL`, which is `SELECT l.*`) so `SellerGstin` is present and the snapshot wins. **`shop.name` and `shop.address` have no equivalent** — they are always today's values. See §K-5.

### Duplicate-source check, per document field

| Printed field | Read from | Any second copy? |
| --- | --- | --- |
| Shop name | `branchdetail.BranchName` (live) | ❌ single source |
| Address | `addressdetail` via FK (live) | ❌ single source |
| GSTIN | `transactiondetaillog.SellerGstin` if present, else `branchdetail.GSTIN` | ⚠️ **two, by design** — snapshot vs live, correctly ordered |
| Tax mode | `transactiondetaillog.TaxMode` on reprint; `resolveTaxMode()` otherwise | ⚠️ **two, by design** |
| FSSAI | `pos_setting['receipt.shop.fssai']` | ❌ single source, never written |
| Footer text | `pos_setting['receipt.bill.footerLine1']` | ❌ single source |
| Invoice number | `transactiondetaillog.TransactionNo` | ❌ single source |

No hard-coded tenant values were found in any renderer. ✅

---

## I. Update / Edit Workflow

| Field | In wizard | Editable later? | Screen | API | Table.Column | Propagates automatically? |
| --- | --- | --- | --- | --- | --- | --- |
| Organization Name | ✅ | ✅ | Master Data → Organizations | `PUT /api/organizations/:id` | `organizationdetail.Name` | ✅ (only affects a super-admin label) |
| Branch Name | ✅ | ✅ | Master Data → Branch Details | `PUT /api/branchdetails/:id` | `branchdetail.BranchName` | ⚠️ yes on new fetches; an **open Billing tab keeps the old masthead until reload** |
| GSTIN | ✅ | ✅ **two doors** | POS Settings → GST **or** Master Data → Branch Details | `PUT /api/pos/tax-settings/branches/:id/gstin` **or** `PUT /api/branchdetails/:id` | `branchdetail.GSTIN` | ⚠️ same one-fetch caveat; documents settled afterwards take the new value |
| Address | ✅ | ✅ | Master Data → Address Details | `PUT /api/addressdetails/:id` | `addressdetail.*` | ⚠️ same caveat |
| Contact name | ✅ | ✅ | Master Data → Contact Details | `PUT /api/contactdetails/:id` | `contactdetail.*` | ✅ nothing downstream consumes it |
| Contact mobile | ❌ | ✅ | Master Data → Contact Details | same | `contactdetail.MobileNo` | ✅ |
| Contact **Email** | ✅ collected | ❌ | — | — | — | **No existing update path found — and no storage.** |
| PAN / TINNo / CF1–4 | ❌ | ✅ | Master Data → Branch Details | `PUT /api/branchdetails/:id` | `branchdetail.*` | ✅ nothing consumes them |
| Invoice number format | ❌ | ✅ | Master Data → Transaction Type Configs | `PUT /api/transactiontypeconfigs/:id` | `transactiontypeconfig.Format` | ✅ next document |
| GST on/off | ❌ | ✅ | POS Settings → GST | `PUT /api/pos/tax-settings` | `pos_tax_setting.GstCharging` | ✅ from the next order; blocked while rounds are open |
| GST off-reason | ❌ | ✅ | POS Settings → GST | same | `pos_tax_setting.OffReason` | ✅ immediately (paper only) |
| Branch tax mode | ❌ | ✅ | Receipt Format | `PUT /api/pos/receipt-format/tax-mode` | `pos_setting['receipt.taxMode']` | ✅; refused while GST is off |
| Receipt field visibility | ❌ | ✅ | Receipt Format | `PUT /api/pos/receipt-format` | `pos_setting['receipt.<doc>.<field>']` | ⚠️ same one-fetch caveat |
| Header / footer text | ❌ | ✅ | Receipt Format | same | `pos_setting['receipt.bill.headerLine'…]` | ⚠️ same caveat |
| **FSSAI number** | ❌ | ❌ | — | — | `pos_setting['receipt.shop.fssai']` | **No existing update path found.** |
| **Logo image** | ❌ | ❌ | — | — | — | **No existing update path found, and no storage.** |
| Item HSN / SAC | ❌ | ✅ | Master Data → Item Details | `PUT /api/itemdetails/:id` | `itemdetail.HSNCode` / `SACCode` | ✅ — but **absent from both the wizard and the CSV import**, so every onboarded item starts without one |

### What "propagates automatically" really means here

There is **no server-side cache** for any of this — every read goes to MySQL. The staleness is entirely client-side and has one cause:

```js
// usePrintReceipt.js:69 — fetched ONCE per branchId, deliberately
useEffect(() => { posService.getReceiptFormat(branchId).then(setFormat) }, [branchId])
```

The comment explains why (a network round trip between pressing Print and paper coming out would be worse). The consequence is that **a GSTIN, name, address or receipt-format change made in one tab does not reach an already-open Billing/Ledger/Kitchen screen until it reloads or switches branch.** For a till that stays open all day, that can be hours. ⚠️

---

## J. Existing vs New Tenant Impact

### New tenant flow

```
sign in with phone → OTP
   │
   ├─ auto-approval ON  → admin.service.autoApproveOnboarding()
   │                       uuidv4() tenant, provisionTenantIam(), Tenant Admin role
   └─ auto-approval OFF → onboarding_requests PENDING → /onboarding → admin approves
   │
   ▼
JWT { tid, setupCompleted: false }
   │
   ▼
requireTenantSetup blocks everything except Home, Audit Logs, Logout, the wizard
   │
   ▼
/master-setup  →  POST /api/master-data/bootstrap  →  setupToken applied
   │
   ▼
application unlocked;  pos_tax_setting has NO row  ⇒  GST charging ON
```

### Existing tenant flow

```
tenant_setup.status = COMPLETED  →  wizard returns 409 forever
                                    /master-setup redirects to /dashboard
   │
   ▼
every later change goes through Master Data / POS Settings / Receipt Format
```

### If you add optional fields to the wizard

| Question | Answer |
| --- | --- |
| What happens to existing tenants? | **Nothing.** They never re-run the wizard — `isSetupComplete()` returns 409 and `MasterDataSetup.js:409` navigates them away. ✅ |
| Will they have NULL/empty values? | Yes, and every reader already handles it: `stored[FSSAI_KEY] \|\| ''`, `data.X \|\| null`, `present()` skips empties. ✅ |
| Migrations required? | **Option 1 (catalogue field): none.** `pos_setting` is key/value. **Option 2 (`branchdetail.FSSAI` column): one `ALTER TABLE`, nullable, no backfill.** |
| Will existing receipts keep working? | ✅ Yes. `receiptFields.shows()` treats an unknown field as "print if it has a value", and an empty new field prints nothing. |
| Will existing invoices keep working? | ✅ Yes. `transactiondetaillog` is append-only; nothing rewrites an issued document. |
| Could a new field break onboarding? | ❌ No, if added as `.optional()`. Every schema node already carries `.unknown(true)`, so an unrecognised key is accepted and ignored rather than rejected — **which is exactly the mechanism that silently swallows `Email` today.** Add the persistence mapping at the same time as the field. ⚠️ |
| Could enabling GST for an existing tenant cause problems? | ⚠️ Three things to know: (a) refused with 409 while any round is open — by design; (b) pricing changes from the *next* order only, historic documents are untouched; (c) **if the branch has no GSTIN, `resolveTaxMode()` returns `unregistered` and bills still print as Bill of Supply.** Turning the tenant switch on is not sufficient — the branch needs a GSTIN too. |

### Backward-compatibility risk register

| Change | Risk | Mitigation |
| --- | --- | --- |
| Add optional wizard field | 🟢 none | must also add the DB mapping |
| Add `branchdetail.FSSAI` | 🟢 low | nullable column, update both `prepare*Params` |
| Add `fssai` to the credit-note catalogue | 🟢 none | defaults flow automatically |
| Make an existing optional field required | 🔴 high | existing tenants' rows are already NULL |
| Change a catalogue **default** | 🟡 medium | branches storing only overrides silently move with it — this is called out at `receipt.format.service.js:13` as the intended behaviour |
| Rename a `pos_setting` key | 🔴 high | orphans every stored override; needs a data migration |

---

## K. Gaps / Missing Functionality

Ordered by how much they cost you. Each is labelled **Implemented / Partially Implemented / Missing / Needs Investigation**.

### K-1 · Contact Email is collected and silently discarded — **Missing**

The wizard asks for it ([MasterDataSetup.js:58](tenant-auth-ui/src/pages/MasterDataSetup.js#L58)). `contactSchema` has `.unknown(true)`, so Joi passes it through. `contactdetail.prepareInsertParams` never maps it, and `contactdetail` has no Email column. The value is typed, submitted, accepted, and lost.

*Fix:* remove the field, or add `contactdetail.Email VARCHAR(100) NULL` plus the two mapping lines. **Removing it is the smaller change and loses nothing, since nothing consumes an email anywhere.**

### K-2 · FSSAI number has no write path — **Missing** (read half is **Implemented**)

Covered in full in §E. The toggle in Receipt Format saves successfully and changes nothing.

### K-3 · Receipt logo has no storage and no renderer — **Missing**

`receipt.catalogue.js:116` defines `vis('logo', 'Logo', NEVER, 'Monochrome, max 384px wide…')`. A branch can set it to `always`, the save succeeds, and:
- `Receipt.js` has no `logo` branch — lines 48–53 render shopName, address, gstin, fssai and nothing else.
- `escposReceipt.js` has no raster-image command.
- No table, column, `pos_setting` key or upload endpoint holds an image.

*Fix (smallest honest one):* delete the catalogue entry until the feature exists. Shipping a toggle that does nothing is worse than not offering it.

### K-4 · Organization Name never reaches a customer document — **Partially Implemented**

The first question the wizard asks produces a value used only by super admins. A tenant who types their trading name into "Organization Name" and a branch code into "Branch Name" will find the branch code printed on every bill.

*Fix:* either relabel the wizard fields to make the distinction obvious ("Legal / group name — not printed on bills" vs "Outlet name — this is what prints"), or add an `organizationName` field to the receipt catalogue. **Relabelling is the one-line change and probably the right one.** ❓ *Which behaviour do you want?* — see §Q1.

### K-5 · Shop name and address are not snapshotted onto documents — **Partially Implemented**

`transactiondetaillog` snapshots `TaxMode`, `SellerGstin`, `BuyerGstin`, `BuyerLegalName`, `CustomerName`, `CustomerMobile` and every amount — the schema comments are explicit that a reprint must say what the paper said. It does **not** snapshot the seller's name or address. Rename a branch, reprint last month's invoice, and it comes out under the new name with the correct old GSTIN. Internally inconsistent, and arguably a compliance problem.

*Fix:* two nullable columns (`SellerName`, `SellerAddress`) written at settle beside `SellerGstin`, and one line in `receiptFields.printedShop()`. ❓ *Is this a real requirement for you?* — see §Q2.

### K-6 · No HSN/SAC anywhere in onboarding — **Missing**

Neither the typed-item step nor the CSV import (`COLUMNS` at `itemImport.js:18`) collects HSN or SAC. `itemdetail` has both columns and the GST pack needs them — `gstexport.builders.js` accumulates `acc.missingCodes` and the HSN sheets are built from `line.code`. **Every tenant onboarded today produces a GST pack with empty HSN codes until someone edits each item by hand.**

*Fix:* add `hsn` and `sac` to the CSV columns. Low cost, high value, no migration.

### K-7 · Two independent doors to the same GSTIN — **Implemented, but duplicated**

`PUT /api/pos/tax-settings/branches/:id/gstin` normalises through `normaliseGstin()` and logs at WARN.
`PUT /api/branchdetails/:id` also accepts `GSTIN` — and **it applies the same `gstinField` rule** ([branchdetail.schemas.js:25 and :50](../googleintegrationbackend/src/modules/branchdetail/branchdetail.schemas.js#L25)). ✅

So validation parity is fine and storage is single-source. What remains is a **UX** duplication, not a data one: two screens that both edit the tenant's tax identity, only one of which shows the state name, the character countdown and the "bills settled afterwards print without a GSTIN" warning.

*Fix (optional):* make `GSTIN` read-only in Master Data → Branch Details and link to POS Settings → GST. Nothing is broken if you leave it.

### K-8 · Open POS screens hold a stale receipt format — **Partially Implemented**

§I explains the mechanism. The one-fetch design is deliberate and correct for print latency; the missing half is invalidation.

*Fix:* re-fetch on window focus, or have `PUT /api/pos/tax-settings` bump a version that the till polls. Low priority unless tills stay open across a GSTIN change.

### K-9 · Credit note has no FSSAI field — **Missing**

The bill's header section has `fssai`; `DOC.CREDIT_NOTE`'s header has only `shopName`, `address`, `gstin`. If FSSAI display is a licence condition, it belongs on both. One catalogue line.

### K-10 · Field length mismatches between wizard and schema — **Needs Investigation**

| Field | Wizard/Joi max | DB column |
| --- | --- | --- |
| `branch.Name` (wizard) | 200 | `branchdetail.BranchName VARCHAR(50)` |
| `BranchName` (branch CRUD) | 100 | `branchdetail.BranchName VARCHAR(50)` |
| `organization.Name` | 200 | `organizationdetail.Name VARCHAR(100)` |
| `contact.FirstName` / `LastName` | 100 | `contactdetail.* VARCHAR(50)` |
| `address.AddressLine1` | 50 | `addressdetail.AddressLine1 VARCHAR(50)` ✅ matches |

A 60-character branch name passes both client and server validation and then hits MySQL. **Neither repo sets `sql_mode`** — I grepped `src/config/`, `scripts/` and `database/` and found nothing — so the behaviour is whatever the server default is. On MySQL 8 that is `STRICT_TRANS_TABLES`, which turns this into a 500 and a rolled-back bootstrap rather than silent truncation. ❓ **Worth confirming against your actual server**, because a non-strict deployment truncates instead, and a truncated branch name prints on every bill.

*Fix:* align the Joi maxima down to the column widths — `mastersetup.schemas.js` (3 lines) and `branchdetail.schemas.js` (2 lines).

### K-11 · No "Business Information" screen — **Missing**

See §F. Answering *"where do I change my business's details?"* currently requires knowing that the answer is in three different sections of two different navigation trees.

### K-12 · No PDF and no email for documents — **Missing**

There is no PDF library and no mail transport in either repo. Printing is `window.print()` ([usePrintReceipt.js](tenant-auth-ui/src/components/frontdesk/receipt/usePrintReceipt.js)) or raw ESC/POS bytes over Bluetooth/serial. `notification_outbox` exists and the `whatsapp` module exists, but no document is rendered to a file. Worth knowing before anyone promises "emailed invoices".

### What is genuinely solid — do not touch it

| Area | Why it's good |
| --- | --- |
| Transactional bootstrap | One transaction, `tenant_setup` flipped inside it, token re-issued, two-pass item import reported separately |
| GST switch | Tenant-scoped, `no row = charging` chosen deliberately over the GSTIN-derived default, refused while rounds are open, append-only history, per-document snapshot |
| Receipt catalogue | One file generates the editor, validator, API and both renderers. Locks are re-applied on every read, not just at save |
| Document snapshots | `TaxMode`, `SellerGstin`, `BuyerGstin`, per-line `TaxComponents` and `TaxCharged` |
| GST pack | Cross-checks each document's `SellerGstin` against the branch's and flags mismatches (`gstexport.builders.js:447`) |
| Tenant isolation | Every query filters `TenantId`; `usePosBranch` validates a remembered branch id against the current tenant's list |

---

## L. Recommended Changes

Minimum change first. Nothing here is a redesign.

### Tier 1 — correctness, ship these

| # | Change | Files | Effort |
| --- | --- | --- | --- |
| 1 | **Remove the Contact Email field** from the wizard (or add the column + mapping) | `MasterDataSetup.js:58` | 1 line |
| 2 | **Remove the `logo` catalogue entry** until a renderer exists | `receipt.catalogue.js:116` | 1 line |
| 3 | **Align Joi maxima to column widths** | `mastersetup.schemas.js` | 3 lines |
| 4 | **Add `hsn` + `sac` to the item CSV import** | `itemImport.js`, `import` module | ~20 lines |
| 5 | **Give FSSAI a write path** — Option 1 from §E: one `text()` catalogue entry, repoint `FSSAI_KEY` | `receipt.catalogue.js`, `receipt.format.service.js:39` | ~15 lines, no migration |

### Tier 2 — clarity

| # | Change | Rationale |
| --- | --- | --- |
| 6 | **Relabel the wizard's two name fields** — "Legal / group name (not printed on bills)" and "Outlet name — this is what prints on every bill" | §K-4; one-line fix for the single most confusing thing in the flow |
| 7 | **Add `fssai` to the credit-note header** in the catalogue | §K-9 |
| 8 | **Make `GSTIN` read-only in Master Data → Branch Details**, with a link to POS Settings → GST | §K-7; cosmetic — both doors already validate identically |
| 9 | **Add a GST step to the wizard** — the switch plus a "you can change this later" note. It writes `pos_tax_setting` inside the same transaction. | Today a composition dealer bills GST from day one until someone finds POS Settings |

### Tier 3 — structural, only if you want them

| # | Change | Rationale |
| --- | --- | --- |
| 10 | **One "Business Information" screen** grouping branch name, address, GSTIN, FSSAI, PAN, contact | §K-11. Pure composition — every underlying API already exists |
| 11 | **Snapshot `SellerName` + `SellerAddress`** onto `transactiondetaillog` | §K-5 |
| 12 | **Invalidate the held receipt format** on focus or via a version bump | §K-8 |

### Recommended single source of truth per concern

| Concern | Owner table | Edited at | Notes |
| --- | --- | --- | --- |
| Tenant identity | `user_tenants.tenant_id` | — | A bare UUID. **Leave it that way** — adding a `tenants` table now would duplicate `organizationdetail` |
| Legal / group name | `organizationdetail.Name` | Master Data → Organizations | Not customer-facing |
| Outlet identity | `branchdetail` | Business Information (Tier 3) | Name, GSTIN, PAN, TIN, FSSAI |
| Printed address | `addressdetail` via FK | Business Information | Already single-source |
| Tax policy (tenant) | `pos_tax_setting` | POS Settings → GST | Already single-source ✅ |
| Compliance numbers | `branchdetail` *(Option 2)* or `pos_setting` *(Option 1)* | Business Information | Pick one and keep FSSAI beside GSTIN |
| Document appearance | `pos_setting['receipt.*']` | Receipt Format | Already single-source ✅ |
| Issued-document facts | `transactiondetaillog` | nothing — append-only | Already correct ✅ |

> **What NOT to do:** do not introduce a `tenants` table, a `tenant_profile` table, or a "business settings" table. Every one of them would become a second home for a fact `branchdetail` already owns — which is precisely the class of problem §9 of your prompt asked me to look for, and which this codebase has so far avoided.

---

## M. End-to-End Test Plan

Written to sit alongside the existing [E2E_TEST_PLAN.md](E2E_TEST_PLAN.md). Each scenario states what to check **in the database**, not just on screen, because several of the gaps above are invisible from the UI.

### Scenario 1 — New tenant, GST OFF (minimum information)

| Step | Action | Expected |
| --- | --- | --- |
| 1 | Sign in as a brand-new phone with auto-approval on | `user_tenants` row, fresh `tenant_id`, no `tenant_setup` row |
| 2 | Navigate anywhere but Home/Audit/Logout | `403 TENANT_SETUP_REQUIRED` |
| 3 | Run the wizard: Org name, Branch name, AddressLine1, First+Last name. **No GSTIN.** Item step off | `201`, response carries an id map + `setupToken` |
| 4 | DB | `organizationdetail` 1 row · `branchdetail` 1 row, `GSTIN IS NULL` · `addressdetail` `TagName='Onboarding'` · `transactiontypeconfig` `Format='INV-{0000}'`, `TagName='Onboarding'` · `tenant_setup.status='COMPLETED'` · **`pos_tax_setting` 0 rows** |
| 5 | POS Settings → GST | Shows **charging ON** (the no-row default) |
| 6 | `GET /api/pos/receipt-format?branchId=…` | `taxMode: 'unregistered'` — **no GSTIN means no tax invoice, even though the tenant switch is on**. `shop.fssai === ''` |
| 7 | Turn GST off, reason `composition` | `pos_tax_setting` 1 row `GstCharging=0` · `pos_tax_mode_history` 1 row |
| 8 | Sell one item, settle | `transactiondetaillog.TaxMode='composition'`, `SellerGstin IS NULL`, `TaxAmount=0` |
| 9 | Print | Header has **no** GSTIN line, **no** FSSAI line, no tax rows; footer carries the composition declaration |
| 10 | Finance → tabs | All render, no `undefined`/`NaN` |

### Scenario 2 — New tenant, GST ON

| Step | Action | Expected |
| --- | --- | --- |
| 1 | Wizard with a valid GSTIN (e.g. `29ABCDE1234F1Z5`) and a typed item in a named tax group with CGST 2.5 / SGST 2.5 | `201` |
| 2 | DB | `branchdetail.GSTIN` set · `taxgroup` 1 row · `taxgrouptaxtypemapper` 2 rows · `TaxTypes` 2 rows |
| 3 | `GET receipt-format` | `taxMode: 'gst'`; `documents.bill.gstin === 'always'` and **locked**; `taxRows` free |
| 4 | Try `PUT receipt-format` with `gstin: 'never'` | `409` — *"cannot be changed: Mandatory on a tax invoice"* |
| 5 | Sell + settle | `TaxMode='gst'`, `SellerGstin` = the branch GSTIN, `TaxAmount > 0`, `TaxByComponent` has CGST + SGST |
| 6 | Print | **TAX INVOICE**, GSTIN line, CGST/SGST split rows |
| 7 | Finance → GST → readiness | No "branch has no GSTIN" error |
| 8 | `GET /api/gst/pack?period=…` | `.zip` named `GST_<GSTIN>_<YYYY-MM>.zip` with 11 CSVs + README |
| 9 | Open `hsn_b2c.csv` | ⚠️ **Expect empty HSN codes** — §K-6. This is the regression test for that fix |

### Scenario 3 — FSSAI provided

> ⚠️ **This scenario cannot pass today.** It is written as the acceptance test for the §E fix.

| Step | Action | Expected **after** the fix |
| --- | --- | --- |
| 1 | Enter an FSSAI number wherever the fix puts it | `pos_setting` row with the licence value |
| 2 | `GET receipt-format` | `shop.fssai === '<the number>'` |
| 3 | Print a bill with `fssai: 'always'` | `FSSAI <number>` under the GSTIN line |
| 4 | Set `fssai: 'never'`, print | Line absent |
| 5 | Clear the number, leave `fssai: 'always'`, print | Line absent — `present()` requires a value |
| 6 | Print a credit note | Line present (requires §K-9) |
| 7 | Direct-printer mode (Bluetooth/serial) | Same line in the ESC/POS bytes |

**Today's actual result, for the record:** steps 1–2 are impossible; step 3 prints nothing. That IS the current expected behaviour.

### Scenario 4 — Optional fields skipped

| Step | Action | Expected |
| --- | --- | --- |
| 1 | Wizard: required fields only. No GSTIN, no City/State/Pincode, item step off | `201` |
| 2 | DB | `addressdetail.City/State/Pincode` all NULL (stripped by `clean()`, never sent) |
| 3 | `GET receipt-format` | `shop.address` = `AddressLine1` only — `CONCAT_WS` drops the NULLs cleanly, **no stray commas** |
| 4 | Print | No `undefined`, no `null`, no `NaN`, no empty labelled rows |
| 5 | Every Finance tab, every Master Data grid | Render without error |
| 6 | Menu Master | Empty, no crash |
| 7 | Settle a bill with an item added later | Works — the wizard's item was genuinely optional |

### Scenario 5 — Update everything after onboarding

| # | Change | Where | Verify |
| --- | --- | --- | --- |
| 5.1 | Branch name | Master Data → Branch Details | New bill masthead ✅ · **reprint of an old invoice also shows the NEW name** ⚠️ (§K-5) |
| 5.2 | Address | Master Data → Address Details | New bill ✅ · old reprint also changes ⚠️ |
| 5.3 | GSTIN via POS Settings → GST | validated, normalised | `branchdetail.GSTIN` updated · **old invoices reprint with their original `SellerGstin`** ✅ · a bill settled after the change carries the new one ✅ |
| 5.4 | GSTIN via Master Data → Branch Details | same column | ✅ Same `gstinField` validation; an invalid GSTIN is rejected here too |
| 5.5 | GST switch with a table open | POS Settings → GST | `409 TAX_SWITCH_BLOCKED`, message names the open orders |
| 5.6 | GST switch with nothing open | same | Succeeds · `pos_tax_mode_history` gains a row with `ChangedBy` |
| 5.7 | Branch tax mode while GST is off | Receipt Format | `409 TAX_MODE_FOLLOWS_GST_SWITCH` |
| 5.8 | Org name | Master Data → Organizations | Super-admin directory label changes · **no document changes** ✅ expected |
| 5.9 | Any change with a Billing tab left open | — | ⚠️ Old masthead persists until reload — §K-8 |
| 5.10 | Footer line 1 → back to its default string | Receipt Format | The `pos_setting` override row is **DELETED**, not set to the default (`receipt.format.service.js:265`) |

### Scenario 6 — Rollback and idempotency (not in your list; add it)

| # | Action | Expected |
| --- | --- | --- |
| 6.1 | Wizard with a tax group named but zero rates | `400`, **nothing persisted** — `organizationdetail` still empty |
| 6.2 | Wizard with `Exempt (0%)` **and** rates | `400` with the contradiction message |
| 6.3 | Replay `POST bootstrap` on a completed tenant | `409 TENANT_SETUP_ALREADY_DONE`, no duplicate org/branch |
| 6.4 | Visit `/master-setup` after completion | Redirect to `/dashboard` |
| 6.5 | CSV import fails, tenancy succeeds | `toast.warn` says the tenancy stands; `tenant_setup='COMPLETED'`; app unlocked |
| 6.6 | Branch name of 60 characters | ❓ **Unknown** — see §K-10. Determine whether this is a 500 or a silent truncation |

---

## Questions for you

These are the points where the code cannot tell me what the business intends.

**Q1 — Organization Name vs Branch Name (§K-4).** Today the wizard's first question produces a value no customer ever sees. Should "Organization Name" print on bills (a catalogue field), or should the labels simply say which one prints? *My recommendation: relabel. One line, no new concept.*

**Q2 — Seller name/address snapshots (§K-5).** Should a reprinted invoice show the business name as it was when issued, the way GSTIN already does? *There is a compliance argument for yes and a simplicity argument for no. GSTIN is already snapshotted, so the current state is internally inconsistent either way.*

**Q3 — FSSAI shape (§E).** Per-branch key/value (Option 1, ~15 lines, no migration) or a `branchdetail` column (Option 2, migration, but collectable in the wizard)? *If you want it in the onboarding wizard, it has to be Option 2.*

**Q4 — GST in the wizard (§L-9).** Should onboarding ask "do you charge GST?" — or is POS Settings the right home, on the grounds that a new tenant cannot answer it either?

**Q5 — Contact Email (§K-1).** Remove the field, or add the column? *Nothing in the codebase consumes an email; removal loses nothing today.*

---

## Appendix — Key files

### Backend
| Path | What it is |
| --- | --- |
| `src/modules/mastersetup/mastersetup.schemas.js` | **The onboarding field contract** |
| `src/modules/mastersetup/mastersetup.service.js` | The bootstrap transaction |
| `src/modules/mastersetup/posMasters.provision.js` | ~15 seeded POS/ledger masters |
| `src/modules/mastersetup/mastersetup.repository.js` | `tenant_setup` state |
| `src/modules/taxsetting/taxsetting.service.js` | **The GST switch** |
| `src/modules/posreceipt/receipt.catalogue.js` | **Every printable field, and its locks** |
| `src/modules/posreceipt/receipt.format.service.js` | Resolver; `FSSAI_KEY` at line 39 |
| `src/modules/gstexport/*` | The CA pack |
| `src/middleware/setupGate.js` | `requireTenantSetup` |
| `database/01-schema-definition.sql` | Schema, heavily commented — `:119`, `:845`, `:984`, `:2488` |

### Frontend
| Path | What it is |
| --- | --- |
| `src/pages/MasterDataSetup.js` | **The wizard** — `STEPS` at line 22 |
| `src/services/masterSetupService.js` | Bootstrap + status calls |
| `src/components/frontdesk/GstSettingsCard.js` | The GST switch UI |
| `src/components/frontdesk/BranchGstinList.js` | Per-branch GSTIN editor |
| `src/pages/frontdesk/ReceiptFormat.js` | Catalogue-driven editor + live preview |
| `src/components/frontdesk/receipt/Receipt.js` | Browser renderer — masthead at lines 48–53 |
| `src/utils/escposReceipt.js` | Thermal renderer — masthead at lines 21–26 |
| `src/utils/receiptFields.js` | `shows` / `present` / **`printedShop`** |
| `src/config/modules.js` | Master Data CRUD definitions |

### Existing design docs worth reading beside this
`TAX_ENGINE_DESIGN.md` · `MASTER_SETUP_GATE_PLAN.md` · `POS_INTEGRATION_PLAN.md` · `LEDGER_SOURCE_OF_TRUTH_PLAN.md` · `WHATSAPP_IDENTITY_MIGRATION.md`
