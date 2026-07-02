# Validation Results — Phase 3 (live, Chrome)

Environment confirmed up: frontend `localhost:3000` (React), backend `localhost:3001` (root 200).
Accounts share ONE tenant `e3845e08-dcc2-11f0-8e78-0242ac110002`:
- Super admin `anmtechsolutions2023@gmail.com` — `is_admin=1, is_super_admin=1`, role SUPER_ADMIN, scopes incl. `TENANT:SUPER_ADMIN`, `TENANT:ADMIN`, all category R/W. Token TTL 60 min.
- Tenant `3mineverything@gmail.com` — `is_admin=0, is_super_admin=0`, roles "Contact and Address Full access" + VIEWER, onboarding APPROVED into the **same** tenant.

> Single-tenant limitation: only one tenant exists, so true cross-tenant data leakage (Chain D) can't be fully exercised; tested instead via forged tenant-id inputs and unscoped-id (IDOR) paths.

---

## Module: Authentication / Session (super-admin portion)
| # | Case | Result | Evidence |
|---|------|--------|----------|
| AUTH-1 | Google login — super admin | PASS | Lands on /dashboard; JWT cookie `app_token` decoded with correct tid/scopes/roles. |
| AUTH-2 | No-token API call | PASS | `GET /api/admin/users` and `/api/taxtypes` → **401** unauthenticated. |
| AUTH-3 | Super-admin privileged endpoints | PASS | `/api/data/settings`, `/api/reports`, `/api/reports/billing`, `/api/audit/logs` all 200 (super-admin bypass). |

## Module: Master Data  (super-admin / write-capable user)
| # | Case | Result | Evidence |
|---|------|--------|----------|
| MD-1 | Master Data index renders all categories/modules | PASS | Sidebar + cards for Master Data, Inventory, Transactions, Payments, Contacts, Organization. |
| MD-2 | List view (Tax Types) | PASS | Shows existing "GST 25%" row, sortable columns, pagination footer "Showing 1 to N". |
| MD-3 | Empty state | PASS | 19/21 module tables empty → render "No Records Found" graphic; search miss shows same. |
| MD-4 | All module list endpoints | PASS | 21 GET `/api/{module}` endpoints all return **200**, tenant-scoped (`WHERE TenantId=?` from token). |
| MD-5 | Create — required-field validation (empty) | PASS | Inline "Name is required" / "Value is required"; submit blocked. |
| MD-6 | Create — numeric boundary (Value 150 > max 100) | PASS | Client HTML5 "Value must be ≤ 100"; **server also 400** "Value must be less than or equal to 100". |
| MD-7 | Create — happy path | PASS | "QA Test VAT"=18 created; toast "Record created successfully"; row appears. |
| MD-8 | Update | PASS | Value 18→22 saved; toast "Record updated successfully". (Note: Active checkbox toggle via automation may need a real onChange — value edit confirmed.) |
| MD-9 | Delete + confirm dialog | PASS | "Are you sure… cannot be undone" → Delete → toast "Record deleted successfully"; row removed. |
| MD-10 | Search filter | PASS | "zzz-no-match" → "No Records Found". |
| MD-11 | Server validation — missing required field via API | PASS | `POST /api/taxtypes {Value}` → 400 "Name is required". |
| MD-12 | Forged TenantId injection via API | PASS (secure) | `POST` with extra `TenantId` of another tenant → **400** (schema rejects unknown field); record NOT created cross-tenant. |
| MD-13 | Invalid record id | PASS | `GET /api/taxtypes/not-a-real-id` → 400 (UUID param validation). |
| MD-14 | FK dependency dropdowns (Item Details) | PASS | Category/UOM/Cost Info required selects render with inline "+" quick-add; empty references handled. |

### MD-15 — All 31 Master Data modules: authenticated CRUD create sweep (super admin)
Built the full FK dependency graph bottom-up via API. Result: **29 of 31 modules create successfully (201)**; 2 have create defects (below). Full CRUD verbs (create/read/update/delete) additionally exercised via UI on Tax Types.

Created OK (201): uom, uomfactors, categories, taxgroups, taxtypes, taxgrouptaxtypemappers, organizations, accounttypebases, transactiontypestatuses, transactiontypeconfigs, contactaddresstypes, mapproviders, mapproviderlocationmappers, locationdetails, costinfos, contactdetails, addressdetails, itemdetails, branchdetails, batchdetails, transactiontypes, transactiontypebaseconversions, transactiondetaillogs, transactionitemdetails, transactiontypeconversionmappers, paymentmodes, paymentreceivedtypes, paymentmodetransactiondetails, paymentdetails.
Uniqueness enforced (good): transactiontypeconfigs (`StartCounterNo` unique → 409 on dup), locationdetails (`Lat` unique → 409 on dup).

### Defects found in Master Data
| ID | Module | Severity | Issue | Evidence |
|----|--------|----------|-------|----------|
| **MD-D1** | paymentbreakups | High (functional) | `POST /api/paymentbreakups` with all valid FK references (AccountTypeBase, PaymentDetail, PaymentModeTransactionDetail, PaymentReceivedType, Timestamp) → **500 Internal Server Error**. Create path is broken. | Reproduced twice with confirmed-present FK ids. |
| **MD-D2** | branchusergroupmappers | Med (functional + FE/BE mismatch) | Frontend defines `UserGroupId` as free **text**, but backend requires a **GUID** (400 "must be a valid GUID"). Supplying a syntactically valid GUID that isn't a real user-group → **500** (FK violation unhandled, no 400/404). Create unusable via UI. | text→400, guid→500. |
| **MD-D3** | addressdetails, branchdetails (and other relational creates) | Low/Med (robustness) | Missing a DB-required FK that the Joi schema does not mark required → **500 Internal Server Error** instead of a 400 validation message. | addressdetails/branchdetails 500 when FK omitted; 201 when present. |

**Master Data verdict:** Core lookup/master tables and the main CRUD surface (validation client+server, tenant-scoping, FK dependencies, empty/loading/search, uniqueness) are solid. Three defects: `paymentbreakups` create returns 500 (broken), `branchusergroupmappers` has a FE/BE contract mismatch + 500 on FK violation, and several relational creates surface 500 instead of 400 when a DB-required FK is missing. Write-authorization for a low-privilege user (tenant without `MASTER_DATA:WRITE`) is pending the tenant-side session.

---

## Module: Referential integrity & reference-data workflows (super admin)

### RI-1 — Delete a parent that is referenced by a child → **PASS (blocked gracefully)**
Tested across all relationships: TaxGroup→Mapper, TaxType→Mapper, UOM→UOMFactor, Category→Item, ContactAddressType→Contact, MapProvider→LocationMapper (and confirmed the same guard fires generally).
Result: `DELETE` of an in-use parent returns **409 "Cannot delete resource — it is referenced by other..."**; the child is **not** orphaned; not a 500.
> Corrects an earlier code-based hypothesis (that master-data deletes had no in-use guard and might 500): the app **does** enforce a graceful in-use check.

### RI-2 — Update a parent value propagates to the child's joined view → **PASS**
Tested: TaxType.Value 7→77 (Mapper.TaxTypeValue), UOM name (UOMFactor.PrimaryUnitName), Category name (Item.CategoryName), CostInfo.Amount 11→88 (Item.CostAmount), MapProvider name (LocationMapper.MapProviderName). All propagate (live LEFT JOIN, no stale copy). Also visible in the UI list (a mapper row showed the renamed group `PROP…-NEW`).
> Test-harness note: two initial false-negatives were self-inflicted — `limit>100` returns 400 (API caps page size at 100), and reusing a duplicate name made the parent update a no-op via the unique constraint. With unique values + `limit=100`, propagation is confirmed.

### RI-3 — Inline "+" nested-create (Tax Group Mapper → create Tax Group inline) → **PASS with UX gap**
Steps: `/master/taxGroupTaxTypeMappers` → Add → "+" next to Tax Group → nested "Create taxGroups" modal (stacked on top) → entered "INLINE-TG-7788" → Create.
Results: ✅ nested modal stacks correctly; ✅ "Tax Groups created successfully"; ✅ record persists; ✅ **dropdown refreshes to include the new option immediately (no page reload)**; ✅ selecting it + a Tax Type and submitting creates the mapper (row `INLINE-TG-7788 | QA-TT`).
⚠️ **Finding RI-D1 (Low, UX):** the newly inline-created record is **not auto-selected** back into the parent dropdown (stays "Select Tax Group"); the user must manually pick it. This is a shared behavior of the reference-field component, so it applies to every module's "+" (Item Details, UOM Factors, etc.).

## Module: Master Data — expanded UI CRUD (super admin)

### MD-UI-1 — Categories full UI CRUD → **PASS**
Create ("UI-QA-Category") → success toast; Edit (name → "UI-QA-Category-EDITED") → success toast + UpdatedOn set; Delete (with "cannot be undone" confirm) → "Record deleted successfully", list back to 6.

### MD-UI-2 (DEFECT F-5, **High**) — Master Data grid crashes on a null reference value (whole-page white-screen)
Steps: navigate `/master/itemDetails` (data contains a record whose reference field is null).
Result: **Uncaught runtime error** — `TypeError: Cannot read properties of null (reading 'Lat')` in `DataTable → renderCell` inside `GenericCrudPage`. The React dev overlay covers the page; there is **no error boundary**, so the entire grid is unusable.
Root cause (source-confirmed): `src/components/MasterData/GenericCrudPage.js` (~lines 690–694, duplicated ~719–723) computes a reference cell as
`typeof value === 'object' ? value.Lat ... : ...`. Since `typeof null === 'object'` in JS, a `null` reference value passes the guard and `value.Lat` throws. Fix: guard with `value && typeof value === 'object'` and/or add a React error boundary around `<DataTable>`.
Impact: any module grid that renders a record with a null reference/FK field crashes; reproduced on Item Details. Console shows React's own advice: "Consider adding an error boundary."
Note: likely surfaced by a record with a null FK (some created during the API sweep), but the crash-on-null-render is a genuine robustness defect independent of how the null arose.

### MD-UI-3 — Units of Measure full UI CRUD → **PASS**
Create ("UI-QA-Meter") → success; Edit toggling `Is Primary` via a real mouse click → row shows IS PRIMARY=1 (persists); Delete + confirm → "Record deleted successfully".

### MD-UI-4 — Checkbox persistence: NOT a bug (test-harness artifact)
Earlier I saw booleans (`Active`, `Is Primary`) stay 0 after being set — this was because the automation's `form_input` on a checkbox does not fire React's controlled `onChange`. Verified by toggling `Is Primary` with a **real mouse click**: it persisted correctly (IS PRIMARY 0→1). So checkbox fields work; the earlier observations were false positives from the tooling, not app defects.

### MD-UI-5 — Cross-cutting grid features → **PASS**
- Column sort: click header → ascending (↑), click again → descending (↓); order changes correctly.
- Refresh button: reloads the list, no error.
- Pagination: Tax Group Mappers "Showing 1 to 10 of 11 entries" with Prev / 1 / 2 / Next; clicking page 2 → "Showing 11 to 11 of 11 entries". Counts accurate (verified against API `pagination.total`).
- Search: filters live; non-match → empty state.
(These are provided by the shared `GenericCrudPage`/`DataTable`, so they apply to every module's grid.)

## Pending (need tenant-account session — Chains B/C/D and remaining auth)
- Master-data WRITE authorization as tenant (expect GET allowed, POST/PUT/DELETE → 403 unless MASTER_DATA:WRITE).
- Negative authz (admin-only actions as tenant: UI + URL + API replay → 403).
- Stateless suspend/delete propagation (S-1), expiry-403-vs-interceptor-401 (S-3), /audit unguarded (S-4), reports scope mismatch (S-5).
