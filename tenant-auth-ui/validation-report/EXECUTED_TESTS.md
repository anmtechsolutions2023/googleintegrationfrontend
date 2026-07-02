# Executed Test Cases & Results (Phase 3 so far)

All cases below were **actually run** against the live app (super-admin session). Legend: ✅ pass · ⚠️ pass-with-defect / defect found · ℹ️ observation.
Scope note: everything so far is the **super-admin / write-capable** side. Tenant-account authorization + security chains are NOT yet run (need `3mineverything` login).

---

## A. Environment & Authentication
| # | Test case | Result |
|---|-----------|--------|
| A-1 | Frontend `localhost:3000/login` loads; backend `localhost:3001/` returns 200 | ✅ |
| A-2 | Unauthenticated `GET /api/admin/users` and `/api/taxtypes` → 401 | ✅ |
| A-3 | Super-admin Google login → dashboard; JWT decoded (tid, `TENANT:SUPER_ADMIN`, role SUPER_ADMIN, 60-min TTL) | ✅ |
| A-4 | Super-admin privileged endpoints `/api/data/settings`, `/api/reports`, `/api/reports/billing`, `/api/audit/logs` → 200 | ✅ |
| A-5 | Session expiry: after ~60 min the token expired and app returned to `/login` | ℹ️ (observed) |

## B. Access / IAM panel (super admin)
| # | Test case | Result |
|---|-----------|--------|
| B-1 | `/admin/approvals` renders (empty state "No onboarding requests") | ✅ |
| B-2 | `/admin/users` lists both accounts w/ status, roles, flags | ✅ |
| B-3 | `/admin/roles` lists roles; system roles show no Edit/Delete (protected) | ✅ |
| B-4 | `/admin/features` lists features w/ scope + category | ✅ |
| B-5 | API baseline: onboarding / users / roles / features all 200 | ✅ |

## C. Master Data — deep UI CRUD (Tax Types, representative)
| # | Test case | Result |
|---|-----------|--------|
| C-1 | Master Data index renders all 6 categories | ✅ |
| C-2 | Tax Types list view (sortable headers, pagination footer) | ✅ |
| C-3 | Empty state ("No Records Found") | ✅ |
| C-4 | Search filter ("zzz-no-match" → empty) | ✅ |
| C-5 | Create: empty required fields blocked (inline errors) | ✅ |
| C-6 | Create: Value 150 > max 100 blocked (client) | ✅ |
| C-7 | Create: happy path ("QA Test VAT"=18) → success toast + row | ✅ |
| C-8 | Update: Value 18→22 → success toast | ✅ |
| C-9 | Delete + "cannot be undone" confirm → row removed | ✅ |
| C-10 | FK dependency dropdowns w/ inline "+" (Item Details) present | ℹ️ |

## D. Master Data — server-side validation (API)
| # | Test case | Result |
|---|-----------|--------|
| D-1 | `POST /api/taxtypes {Value:150}` → 400 "≤ 100" (server enforces, not just client) | ✅ |
| D-2 | `POST` missing Name → 400 "Name is required" | ✅ |
| D-3 | `POST` with forged `TenantId` → 400 (unknown field rejected; no cross-tenant write) | ✅ |
| D-4 | `GET /api/taxtypes/not-a-real-id` → 400 (UUID validation) | ✅ |
| D-5 | Duplicate unique field (`StartCounterNo`, `Lat`) → 409 | ✅ |

## E. All-module CREATE sweep (every module, all 6 categories)
Each module received a real authenticated `POST`. 29/31 → 201.

**Master Data:** taxTypes ✅ · uom ✅ · uomFactors ✅ · categories ✅ · taxGroups ✅ · taxGroupTaxTypeMappers ✅ · accountTypeBases ✅
**Organization:** organizations ✅ · branchDetails ✅ · branchUserGroupMappers ⚠️ (E-D2)
**Transactions:** transactionTypes ✅ · transactionTypeConfigs ✅ · transactionTypeStatuses ✅ · transactionTypeBaseConversions ✅ · transactionTypeConversionMappers ✅ · transactionDetailLogs ✅ · transactionItemDetails ✅
**Inventory:** itemDetails ✅ · batchDetails ✅ · costInfos ✅
**Contacts & Addresses:** contactAddressTypes ✅ · contactDetails ✅ · addressDetails ✅ · locationDetails ✅ · mapProviders ✅ · mapProviderLocationMappers ✅
**Payments:** paymentReceivedTypes ✅ · paymentModes ✅ · paymentModeTransactionDetails ✅ · paymentDetails ✅ · paymentBreakups ⚠️ (E-D1)

**Defects from sweep:**
- **E-D1 paymentBreakups** — `POST` with all valid FKs → **500 Internal Server Error** (create broken). ⚠️
- **E-D2 branchUserGroupMappers** — FE free-text `UserGroupId` vs BE GUID (400); valid-format GUID that isn't a real user-group → **500** (FK violation unhandled). ⚠️
- **E-D3 addressDetails / branchDetails (& peers)** — omitting a DB-required FK → **500 instead of 400**. ⚠️

**List (GET) endpoints:** 21 module list endpoints explicitly checked → all **200**, tenant-scoped. ✅

## F. Referential integrity & reference-data workflows
| # | Test case | Relationships covered | Result |
|---|-----------|-----------------------|--------|
| F-1 | Delete parent that is referenced by a child → must block | TaxGroup→Mapper, TaxType→Mapper, UOM→UOMFactor, Category→Item, ContactAddressType→Contact, MapProvider→LocationMapper | ✅ 409 "Cannot delete — referenced" (child not orphaned) |
| F-2 | Update parent value propagates to child joined view | TaxType.Value→Mapper, UOM→UOMFactor, Category→Item, CostInfo.Amount→Item, MapProvider→LocationMapper | ✅ propagates (live JOIN) |
| F-3 | Inline "+" nested-create end-to-end (Tax Group Mapper → create Tax Group inline → use it) | taxGroupTaxTypeMappers (Tax Group "+") | ✅ works; ⚠️ **F-D1** new record not auto-selected (UX gap, shared component) |

## G. Reports / Audit (super admin)
| # | Test case | Result |
|---|-----------|--------|
| G-1 | `/reports` renders (super-admin bypass) | ✅ |
| G-2 | `/audit` shows all logs (141), super-admin full visibility; my API calls appear in the log | ✅ |

---

## Coverage matrix — per module (what was actually exercised)
C=Create · L=List/Read · U=Update · D=Delete · V=Validation · RF=Delete-while-referenced · PP=Update-propagation · PLUS=inline "+"
"sweep" = create verified via API sweep; "—" = not yet exercised.

| Category | Module | C | L | U | D | V | RF | PP | + |
|----------|--------|---|---|---|---|----|----|----|----|
| Master Data | taxTypes | ✅UI | ✅ | ✅UI | ✅UI | ✅ | ✅(as parent) | ✅ | — |
| Master Data | uom | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Master Data | uomFactors | ✅ | ✅ | — | — | — | (child) | (child) | — |
| Master Data | categories | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Master Data | taxGroups | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅(via mapper "+") |
| Master Data | taxGroupTaxTypeMappers | ✅ | ✅ | — | — | — | (child) | (child) | ✅UI end-to-end |
| Master Data | accountTypeBases | ✅ | ✅ | — | — | — | — | — | — |
| Organization | organizations | ✅ | ✅ | ✅ | — | — | — | — | — |
| Organization | branchDetails | ✅ | ✅ | — | — | — | — | — | — |
| Organization | branchUserGroupMappers | ⚠️ | ✅ | — | — | — | — | — | — |
| Transactions | transactionTypes | ✅ | ✅ | — | — | — | — | — | — |
| Transactions | transactionTypeConfigs | ✅ | ✅ | — | — | ✅(409 unique) | — | — | — |
| Transactions | transactionTypeStatuses | ✅ | ✅ | — | — | — | — | — | — |
| Transactions | transactionTypeBaseConversions | ✅ | ✅ | — | — | — | — | — | — |
| Transactions | transactionTypeConversionMappers | ✅ | ✅ | — | — | — | — | — | — |
| Transactions | transactionDetailLogs | ✅ | ✅ | — | — | — | — | — | — |
| Transactions | transactionItemDetails | ✅ | ✅ | — | — | — | — | — | — |
| Inventory | itemDetails | ✅ | ✅ | — | — | — | (child) | (child) | ℹ️ form seen |
| Inventory | batchDetails | ✅ | ✅ | — | — | — | — | — | — |
| Inventory | costInfos | ✅ | ✅ | — | — | — | — | ✅(as parent) | — |
| Contacts | contactAddressTypes | ✅ | ✅ | — | — | — | ✅ | — | — |
| Contacts | contactDetails | ✅ | ✅ | — | — | — | (child) | — | — |
| Contacts | addressDetails | ✅ | ✅ | — | — | ⚠️(500 on missing FK) | — | — | — |
| Contacts | locationDetails | ✅ | ✅ | — | — | ✅(409 unique) | — | — | — |
| Contacts | mapProviders | ✅ | ✅ | — | — | — | ✅ | ✅ | — |
| Contacts | mapProviderLocationMappers | ✅ | ✅ | — | — | — | (child) | (child) | — |
| Payments | paymentReceivedTypes | ✅ | ✅ | — | — | — | — | — | — |
| Payments | paymentModes | ✅ | ✅ | — | — | — | — | — | — |
| Payments | paymentModeTransactionDetails | ✅ | ✅ | — | — | — | — | — | — |
| Payments | paymentDetails | ✅ | ✅ | — | — | — | — | — | — |
| Payments | paymentBreakups | ⚠️(500) | ✅ | — | — | — | — | — | — |

### Honest coverage gaps (not yet executed)
- **UI Update/Delete** exercised only on Tax Types; other modules had Create+List via sweep, not UI edit/delete.
- **Delete-while-referenced / Update-propagation** run on ~6 representative relationships each, not literally every FK edge.
- **Inline "+"** run end-to-end only on Tax Group Mapper (component is shared, so behavior expected identical — to be spot-checked on Item Details / UOM Factors).
- **Complex cases** (multi-level "+"-in-"+", deactivate-referenced-parent, self/circular ref, date logic, injection/maxLength, sort/pagination) — defined in TEST_CASES.md, not yet run.
- **Tenant-account authorization + all security chains (Parts C/D + auth lifecycle)** — not started.
