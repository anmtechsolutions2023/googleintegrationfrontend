# Multi-Tenant Auth App — Validation Report

**App:** tenant-auth-ui (React) + googleintegrationbackend (Express/MySQL)
**Environment:** frontend `localhost:3000`, backend `localhost:3001` — both live/up.
**Session used:** Super admin `anmtechsolutions2023@gmail.com` (scopes incl. `TENANT:SUPER_ADMIN`).
**Companion files:** `Validation_Report.xlsx` (full case list + steps + results), `TEST_PLAN.md`, `TEST_CASES.md`, `EXECUTED_TESTS.md`, `RESULTS.md`.

---

## 1. Executive summary

| Metric | Count |
|---|---|
| Test cases executed | 41 |
| Passed | 35 |
| Passed with caveat (sweep: 29/31) | 1 |
| Defects found | 5 |
| Security/authorization items (pending tenant session) | 9 |

**Overall:** The core Master Data surface — CRUD, client + server validation, tenant-scoping, referential integrity, reference dependencies, and grid features (sort/search/pagination/refresh) — is solid. Five defects were found, two of them **High** (a full-page grid crash and a broken create endpoint). The tenant-side authorization and security chains have **not** been executed yet and are listed in Section 5.

**Key architectural note:** both test accounts are provisioned into the **same tenant** (`e3845e08-…110002`); `3mineverything` is a non-admin member (roles VIEWER + "Contact and Address Full access"). There is no second tenant, so true cross-tenant isolation can only be probed via forged IDs — flagged as a coverage limitation.

---

## 2. Results by module / area

### Authentication & Session — PASS (5/5)
App reachability; unauthenticated API → 401; super-admin Google login with correct JWT (tid, scopes, role, 60-min TTL); privileged endpoints 200; session expiry returns to `/login`.

### Access / IAM panel — PASS (5/5)
Approvals, Users, Roles, Features all render; system roles are non-deletable; admin API baseline all 200.

### Master Data — CRUD & validation — PASS
- **UI CRUD** verified end-to-end on **Tax Types, Categories, Units of Measure** (create / edit / delete + confirm dialog, all with success toasts). UOM confirmed the `Is Primary` boolean persists (0→1) via a real click.
- **Validation** (client + server): required fields, numeric bounds (Value ≤ 100 enforced on **both** layers), missing fields (400), invalid UUID (400), unique constraints (409), and forged `TenantId` rejected (400 — no cross-tenant write).
- **Empty / search states**, **column sort** (asc/desc), **Refresh**, and **pagination** (Prev/1/2/Next; counts accurate vs API) all pass. These come from the shared `GenericCrudPage`/`DataTable`, so they apply to every grid.

### Master Data — all-module create sweep — 29/31 PASS
Every module across all 6 categories (Master Data, Inventory, Transactions, Payments, Contacts & Addresses, Organization) received an authenticated create with the FK dependency graph built bottom-up. **29 create (201)**; 2 defective (see D-1, D-2). All list endpoints return 200 and are tenant-scoped.

### Master Data — referential integrity — PASS
- **Delete-while-referenced:** blocked gracefully with **409 "Cannot delete resource — it is referenced by other…"** across TaxGroup→Mapper, TaxType→Mapper, UOM→UOMFactor, Category→Item, ContactAddressType→Contact, MapProvider→LocationMapper; child not orphaned.
- **Update-propagation:** parent edits (TaxType value 7→77, UOM/Category/MapProvider names, CostInfo 11→88) reflect in the child's joined view (live JOINs).
- **Inline "+" nested-create:** end-to-end on Tax Group Mapper — nested modal stacks, record persists, dropdown refreshes without reload, and the mapper is created using the inline-created group.

### Reports / Audit — PASS
Reports renders (super-admin bypass); Audit shows all 141 logs with full super-admin visibility, and test actions appear in the log.

---

## 3. Defects (with reproduction & severity)

### D-1 (High) — Master Data grid white-screens on a null reference value
**Repro:** open `/master/itemDetails` (data contains a record whose reference field is null).
**Actual:** Uncaught `TypeError: Cannot read properties of null (reading 'Lat')` in `DataTable → renderCell` (`GenericCrudPage`); React dev overlay covers the page; **no error boundary** → grid unusable.
**Root cause (source):** `src/components/MasterData/GenericCrudPage.js` (~L690–694, dup ~719–723) does `typeof value === 'object' ? value.Lat … : …`; since `typeof null === 'object'`, a null reference passes and `value.Lat` throws.
**Fix:** guard `value && typeof value === 'object'`; add a React error boundary around `<DataTable>`.
**Impact:** any grid rendering a record with a null reference/FK crashes.

### D-2 (High) — `paymentBreakups` create returns 500
**Repro:** `POST /api/paymentbreakups` with valid `AccountTypeBaseId`, `PaymentDetailId`, `PaymentModeTransactionDetailId`, `PaymentReceivedTypeId`, `Timestamp`.
**Actual:** **500 Internal Server Error** (reproduced twice). Create path is broken.

### D-3 (High) — `branchUserGroupMappers` FE/BE mismatch + 500
**Repro:** create with `UserGroupId` as (a) free text, (b) a valid-format GUID.
**Actual:** (a) 400 "must be a valid GUID" — but the **frontend field is free text**; (b) valid-format GUID that isn't a real user-group → **500** (FK violation unhandled). Create unusable via UI.

### D-4 (Medium) — 500 instead of 400 on missing required FK
**Repro:** `POST /api/addressdetails` or `/api/branchdetails` omitting a DB-required FK.
**Actual:** **500 Internal Server Error** instead of a clean 400 validation message (the Joi schema doesn't mark the FK required; DB NOT-NULL fails).

### D-5 (Low, UX) — Inline "+" does not auto-select the new record
**Repro:** in a child create form, click "+", create a parent inline.
**Actual:** the new record is created and appears in the dropdown, but is **not auto-selected**; user must pick it manually. Shared reference-field component → affects every module's "+".

> Non-defects ruled out: booleans appearing not to save was a **test-harness artifact** (automated `form_input` doesn't fire React's checkbox `onChange`); a real click persists correctly. Two propagation "fails" were harness bugs (API caps `limit` at 100; duplicate-name no-op) — re-run and confirmed passing.

---

## 4. Severity roll-up
- **High:** D-1 (grid crash), D-2 (paymentBreakups 500), D-3 (branchUserGroupMappers).
- **Medium:** D-4 (500 vs 400 on missing FK).
- **Low:** D-5 (inline-"+" auto-select UX).

---

## 5. Security / Authorization Findings — NOT YET EXECUTED (pending tenant session)

These are **code-analysis risks** identified in Phase 1. They require the `3mineverything` tenant login to validate dynamically and are flagged **High severity by default** where a boundary could fail. Status: **PENDING**.

| ID | Severity | Risk | Planned validation |
|---|---|---|---|
| S-1 | High | Suspend/delete does **not** invalidate an existing JWT (stateless; logout returns 200 only) — user keeps access until token expiry. | Capture tenant JWT → SA suspends/deletes → replay JWT vs `/api/taxtypes`. |
| S-2 | High | `GET /api/admin/roles/:roleId/permissions` is **not tenant-scoped** (roleId only) — potential cross-tenant IDOR. | As tenant-admin A, request a roleId of tenant B. |
| C-neg | High | Authorization boundary: as TENANT, every super-admin-only action via (1) UI, (2) direct URL, (3) API replay must return 401/403. | Run all three vectors vs `/api/admin/*`, `/api/data/settings`, audit cross-tenant filter. |
| D-iso | High | Tenant isolation: one tenant must not read/modify another's data (change IDs in URL/API). | Forged `tenantId`/foreign `roleId`; note single-tenant limitation. |
| B-dep | High | Super-admin → tenant lifecycle propagation (tenant loses access on next login; references handled). | Full chain via UI + JWT replay. |
| S-3 | Medium | Expiry returns **403** but client interceptor only handles **401** → no auto-logout/redirect on expiry. | Expire token; observe on API 403. |
| S-4 | Medium | `/audit` route has **no** client-side guard; reachable while logged out (contradicts "protected URL → /login"). | Visit `/audit` logged out. |
| E-goog | Medium | Google OAuth connect/consent, token storage, disconnect/revoke, cancel/deny/error paths. | Both accounts incl. cancel/deny. |
| S-5 | Low | FE `reports:READ` vs BE `REPORTS:READ` scope case mismatch → guard/server may disagree. | Tenant with reports role → `/reports`. |
| S-6 | Low | `decodeToken` ignores `exp`; UI looks logged-in with an expired token until an API call fails. | Load app with expired cookie. |

---

## 6. Recommended next step
Log in as the tenant (`3mineverything@gmail.com`) to execute Section 5 (authorization boundary, tenant isolation, suspend/delete propagation, Google integration paths) and the master-data **write-authorization** check (VIEWER should get 403 on writes, 200 on reads). Then this report's Security section moves from PENDING to verified results.
