# Master-Data & Auth — Complete Test-Case Catalog

Format: each case has a **Description**, **Steps**, **Expected result**, and **Status**.
Status legend: ✅ Validated · ⚠️ Validated, defect found · ⬜ Not yet validated · ⏭ Pending tenant-account session.

Reference entities used below: **TG** = Tax Group, **TT** = Tax Type, **TGM** = Tax Group ↔ Tax Type Mapper, **UOM/UOMF** = Unit of Measure / UOM Factor, **CI** = Cost Info, **Item** = Item Detail.

---

## PART 1 — Test cases ALREADY VALIDATED

### 1.1 Environment & Authentication
**TC-A01 — App reachability** · ✅
Steps: 1) Navigate `http://localhost:3000/login`. 2) Fetch `http://localhost:3001/`.
Expected: Login page renders with Google button; backend root returns 200.

**TC-A02 — Unauthenticated API is rejected** · ✅
Steps: 1) With no token, call `GET /api/admin/users` and `GET /api/taxtypes`.
Expected: Both return **401**.

**TC-A03 — Super-admin Google login** · ✅
Steps: 1) Click "Sign in with Google". 2) Complete Google auth for super admin. 3) Decode `app_token` cookie.
Expected: Redirect to `/dashboard`; JWT has correct `tid`, scopes incl. `TENANT:SUPER_ADMIN`, role `SUPER_ADMIN`, TTL 60 min.

**TC-A04 — Super-admin privileged endpoints** · ✅
Steps: 1) As super admin call `/api/data/settings`, `/api/reports`, `/api/reports/billing`, `/api/audit/logs`.
Expected: All 200 (super-admin scope bypass).

### 1.2 Access (IAM) panel render
**TC-IAM01..04 — Approvals / Users / Roles / Features render** · ✅
Steps: 1) Navigate `/admin/approvals`, `/admin/users`, `/admin/roles`, `/admin/features`.
Expected: Each tab renders; Users lists both accounts with status/roles/flags; Roles show system roles as non-deletable (Permissions only); Features list scopes/categories.

### 1.3 Master Data — Tax Types (full UI CRUD)
**TC-MD01 — Master Data index renders all categories** · ✅
Steps: 1) Navigate `/master`.
Expected: Sidebar + cards for Master Data, Inventory, Transactions, Payments, Contacts, Organization.

**TC-MD02 — List view** · ✅
Steps: 1) Open `/master/taxTypes`.
Expected: Existing rows shown; sortable headers; pagination footer "Showing 1 to N".

**TC-MD03 — Empty state** · ✅
Steps: 1) Open a module with no records / search a non-match.
Expected: "No Records Found" placeholder.

**TC-MD04 — Search filter** · ✅
Steps: 1) In Tax Types search box type "zzz-no-match".
Expected: Empty-state shown; list filtered.

**TC-MD05 — Create: required-field validation** · ✅
Steps: 1) Add Tax Type. 2) Leave Name & Value empty. 3) Click Create.
Expected: Inline "Name is required" / "Value is required"; submit blocked.

**TC-MD06 — Create: numeric boundary (client)** · ✅
Steps: 1) Enter Value 150 (max 100). 2) Create.
Expected: HTML5 "Value must be ≤ 100"; blocked.

**TC-MD07 — Create: happy path** · ✅
Steps: 1) Name "QA Test VAT", Value 18, Active on. 2) Create.
Expected: Toast "Record created successfully"; new row appears.

**TC-MD08 — Update** · ✅
Steps: 1) Edit the row. 2) Change Value 18→22. 3) Update.
Expected: Toast "Record updated successfully"; value shows 22.

**TC-MD09 — Delete + confirm** · ✅
Steps: 1) Delete the row. 2) Confirm in "cannot be undone" dialog.
Expected: Toast "Record deleted successfully"; row removed.

### 1.4 Master Data — backend/API validation & scoping
**TC-MD10 — Server rejects out-of-range** · ✅
Steps: 1) `POST /api/taxtypes {Value:150}`.
Expected: 400 "Value must be less than or equal to 100".

**TC-MD11 — Server rejects missing required** · ✅
Steps: 1) `POST /api/taxtypes {Value:5}` (no Name).
Expected: 400 "Name is required".

**TC-MD12 — Forged TenantId injection blocked** · ✅
Steps: 1) `POST /api/taxtypes {Name,Value,TenantId:<other>}`.
Expected: 400 (unknown field rejected); no cross-tenant record.

**TC-MD13 — Invalid id param** · ✅
Steps: 1) `GET /api/taxtypes/not-a-real-id`.
Expected: 400 (UUID validation).

**TC-MD14 — All-modules list endpoints** · ✅
Steps: 1) `GET /api/{module}` for all 21+ modules.
Expected: All 200, tenant-scoped.

**TC-MD15 — All-modules create sweep** · ✅ / ⚠️
Steps: 1) Build FK graph bottom-up; POST one record per module.
Expected: 29/31 create (201). Defects: TC-MD-D1/D2/D3 below.

**TC-MD16 — Uniqueness constraints** · ✅
Steps: 1) POST duplicate `transactiontypeconfigs.StartCounterNo` / `locationdetails.Lat`.
Expected: 409 "already exists".

**TC-MD17 — FK dropdowns present with inline "+"** · ✅ (observed only)
Steps: 1) Open Item Details create.
Expected: Category/UOM/Cost Info are required selects each with a "+" button. (NOTE: "+" not exercised — see Part 2.)

### 1.5 Reports / Audit (super admin)
**TC-R01 — Reports page** · ✅   |   **TC-AU01 — Audit visibility (super admin sees all, 141 logs, actions logged)** · ✅

### 1.6 Defects already found
**TC-MD-D1 — paymentbreakups create 500** · ⚠️ POST with all valid FKs → 500 Internal Server Error.
**TC-MD-D2 — branchusergroupmappers contract mismatch** · ⚠️ FE free-text `UserGroupId` vs BE GUID (400); valid-format GUID → 500 (FK violation unhandled).
**TC-MD-D3 — 500 instead of 400 on missing FK** · ⚠️ addressdetails/branchdetails (and peers) 500 when a DB-required FK is omitted.

---

## PART 2 — MISSED cases we explicitly discussed

### 2.1 Inline "+" nested-create workflow
**TC-NEST01 — Inline-create parent from child form (TGM → new Tax Group)** · ⬜
Steps: 1) `/master/taxGroupTaxTypeMappers` → Add. 2) In popup, click "+" next to Tax Group. 3) Nested form opens; enter name; Save.
Expected: Nested modal closes, returns to mapper popup, **new TG auto-selected**, TG also appears in Tax Groups list.

**TC-NEST02 — Inline-create second parent (TGM → new Tax Type)** · ⬜
Steps: 1) Continue TC-NEST01; click "+" next to Tax Type; create a TT; Save.
Expected: New TT auto-selected in the mapper popup.

**TC-NEST03 — Submit child using inline-created parents** · ⬜
Steps: 1) With TG & TT created inline selected, submit the mapper.
Expected: Mapper created (201); row visible; expanded columns show the new names/values.

**TC-NEST04 — Cancel nested form retains parent state** · ⬜
Steps: 1) Open mapper popup, partially fill; 2) open a "+" nested form; 3) Cancel it.
Expected: Parent popup still open with prior entries intact; no data lost.

**TC-NEST05 — Validation inside nested form** · ⬜
Steps: 1) Open "+" nested TG form; 2) submit empty.
Expected: Inline required-field error; nested form stays open.

**TC-NEST06 — Inline "+" across all FK modules** · ⬜
Modules: uomFactors (Primary/Secondary UOM), itemDetails (Category/UOM/CostInfo), addressDetails (Address Type/Location Mapper), branchDetails (Address/Contact/Org/Config), transaction* and payment* modules.
Expected: "+" opens correct nested form, creates, auto-selects, in every module.

### 2.2 Delete-while-referenced (referential integrity)
**TC-REF-DEL01 — Delete Tax Group used by a Mapper** · ⬜
Steps: 1) Create TG; 2) create TGM referencing it; 3) delete the TG.
Expected: Delete **blocked** with graceful message (e.g., 409 "in use"); child not orphaned; NOT a 500.

**TC-REF-DEL02..N — Same for every relationship** · ⬜
Pairs: UOM↔UOMFactor/Item, Category↔Item, CostInfo↔Item/Batch, Organization/Address/Contact/Config↔Branch, TransactionConfig↔TransactionType/Log, TransactionLog↔ItemDetail/PaymentDetail, PaymentDetail↔PaymentBreakup, etc.
Expected: Delete of an in-use parent blocked gracefully everywhere.

### 2.3 Update-propagation to referenced views
**TC-REF-UPD01 — Update Tax Group value reflects in Mapper** · ⬜
Steps: 1) Create TG "A"=x + TGM referencing it; 2) note mapper's shown group name/value; 3) edit TG → "B"=y; 4) reload/reopen the mapper list.
Expected: Mapper's joined columns now show "B"/y (live JOIN, no stale value).

**TC-REF-UPD02..N — Same across joined displays** · ⬜
Views: UOM Factor (UOM names), Item (Category/UOM/Cost), Branch (Org/Contact/Address), Payment Detail/Breakup (account/mode/received-type names).
Expected: Parent edits reflected in child expanded columns.

---

## PART 3 — ADDITIONAL & COMPLEX (mix-and-match) scenarios

### 3.1 Nested-create combinations
**TC-CX01 — Multi-level nested ("+" inside "+")** · ⬜
Steps: 1) Item Details → Add; 2) "+" on Cost Info; 3) inside Cost Info form, "+" on Tax Group; 4) create TG, then CI, then Item.
Expected: Modal stack unwinds correctly; each new record auto-selected up the chain; final Item created.

**TC-CX02 — Inline-create parent, then delete it while the child (unsaved) still references it** · ⬜
Steps: 1) Inline-create TG in a TGM popup; 2) in another tab delete that TG; 3) submit the mapper.
Expected: Submit fails gracefully (parent gone) — no 500, clear error.

**TC-CX03 — Inline-create parent, then update it, verify propagation** · ⬜
Steps: 1) Inline-create TG via TGM "+"; 2) submit mapper; 3) edit that TG's value; 4) reload mapper.
Expected: Updated value shown (combines TC-NEST + TC-REF-UPD).

**TC-CX04 — Stacked modals focus/z-index** · ⬜
Steps: 1) Open child popup; 2) open "+" nested; 3) interact with nested fields/buttons.
Expected: Nested modal on top, focus trapped correctly, background not clickable.

**TC-CX05 — Dropdown refresh without manual reload** · ⬜
Steps: 1) Inline-create a parent; observe child dropdown.
Expected: New option present immediately without page refresh.

### 3.2 Referential-integrity edge combinations
**TC-CX06 — Delete child then parent (reverse order)** · ⬜
Steps: 1) Delete TGM; 2) delete TG.
Expected: Both succeed once the reference is gone.

**TC-CX07 — Duplicate mapper (same TG+TT)** · ⬜
Steps: 1) Create TGM(TG1,TT1); 2) create another TGM(TG1,TT1).
Expected: Defined behavior — either rejected (dup) or allowed; document actual.

**TC-CX08 — Deactivate parent (Active=false) referenced by child** · ⬜
Steps: 1) Create TG + TGM; 2) set TG Active=false; 3) open TGM list and the TGM create dropdown.
Expected: Document whether inactive parent still displays in child and whether it's selectable for new children.

**TC-CX09 — Self / circular reference (UOM Factor primary=secondary)** · ⬜
Steps: 1) Create UOM Factor with Primary UOM == Secondary UOM.
Expected: Rejected or documented (should likely be rejected).

**TC-CX10 — Cascade depth delete (Transaction Log in use by Item Detail AND Payment Detail)** · ⬜
Steps: 1) Build a Transaction Log referenced by both; 2) delete the log.
Expected: Blocked gracefully; no partial/orphan state.

**TC-CX11 — Date logic (Batch Expdate before MfgDate)** · ⬜
Steps: 1) Create Batch with Expdate < MfgDate.
Expected: Validation error (should be rejected).

**TC-CX12 — Numeric precision / negatives / zero (UOM Factor `Factor`, amounts)** · ⬜
Steps: 1) Enter negative, zero, and high-precision values.
Expected: Sensible bounds enforced.

**TC-CX13 — maxLength & special characters / injection in text fields** · ⬜
Steps: 1) Enter over-max strings and `', ";--`, `<script>` in Name fields.
Expected: Truncated/validated; stored safely; no SQL error / no XSS on render.

### 3.3 Authorization × referenced-data (needs tenant session) ⏭
**TC-CX14 — Read-only user (VIEWER) attempts create/update/delete** · ⏭
Steps: 1) As `3mineverything` (VIEWER + Contacts) open a master module; 2) attempt Add/Edit/Delete; 3) replay `POST/PUT/DELETE` via API.
Expected: UI write buttons hidden/disabled AND backend returns **403** (only GET allowed without MASTER_DATA:WRITE).

**TC-CX15 — Low-priv user uses inline "+"** · ⏭
Steps: 1) As VIEWER open a child form; click "+".
Expected: Either "+" hidden, or nested create returns 403 from server (not a client-only block).

**TC-CX16 — Contacts-scoped user writes only Contacts** · ⏭
Steps: 1) As `3mineverything` (has CONTACTS:WRITE) create a Contact (expect 200) and a Tax Type (expect 403).
Expected: Writes permitted only within granted category scope.

### 3.4 Tenant isolation × referenced-data ⏭
**TC-CX17 — Forged foreign FK id in child create** · ⏭
Steps: 1) As tenant, create a child referencing a parent `Id` from another tenant (guessed/known).
Expected: Rejected/scoped (parent not visible in caller's tenant → 400/404), no cross-tenant link formed.

**TC-CX18 — Read another tenant's record by changing `:id`** · ⏭
Steps: 1) `GET /api/{module}/{otherTenantRecordId}`.
Expected: 404/empty (tenant-scoped query), never another tenant's data.

**TC-CX19 — Role-permission IDOR (`/api/admin/roles/:roleId/permissions`)** · ⏭
Steps: 1) As tenant-admin of A, request a roleId belonging to B.
Expected: 403/scoped (endpoint currently not tenant-scoped — S-2 to confirm).

### 3.5 Session / lifecycle × in-flight work ⏭
**TC-CX20 — Token expiry mid nested-create** · ⏭
Steps: 1) Open a child popup + "+" nested; 2) let token expire; 3) submit.
Expected: Graceful handling — redirect to login / clear error. (Note S-3: backend 403 vs interceptor’s 401-only → likely NOT handled.)

**TC-CX21 — Suspend/delete propagation to an active session** · ⏭
Steps: 1) Capture tenant JWT; 2) super admin suspends then deletes the tenant; 3) replay tenant JWT against `/api/taxtypes`.
Expected (desired): 401/403 immediately. (Note S-1: stateless JWT likely still works until expiry.)

**TC-CX22 — Concurrent edit / stale update (two tabs)** · ⬜
Steps: 1) Open same record in two tabs; 2) update in tab A; 3) update in tab B with old data.
Expected: Defined behavior (last-write-wins vs conflict); document.

### 3.6 List UX
**TC-CX23 — Column sort incl. joined columns** · ⬜   |   **TC-CX24 — Pagination navigation** · ⬜   |   **TC-CX25 — Refresh button reloads list** · ⬜   |   **TC-CX26 — Search across multiple configured fields** · ⬜

---

## PART 4 — Broader security/auth chains still pending (from Phase-2 plan) ⏭
Auth lifecycle (logout, refresh persistence, protected-URL-while-logged-out redirect, `/audit` guard S-4), negative authz boundary (admin-only actions as tenant via UI/URL/API-replay → 403), reports scope case-mismatch (S-5), `decodeToken` ignores exp (S-6). These require the tenant login and a controlled logged-out state.
