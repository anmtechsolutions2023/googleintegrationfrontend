# E2E Test Plan — Tenant Auth UI
**URL:** `http://localhost:3000/master`
**Scope:** 27 modules, 6 categories, ~190 test cases
**Tool:** Playwright (E2E) + React Testing Library (component)
**Status:** Plan approved, not yet implemented

---

## Module Dependency Hierarchy

```
LEAF (no FK)
  taxTypes, uom, categories, taxGroups, organizations,
  transactionTypeStatuses, contactAddressTypes, mapProviders,
  locationDetails, accountTypeBases, paymentModes, paymentReceivedTypes

LEVEL 1 (refs leafs)
  uomFactors → uom
  taxGroupTaxTypeMappers → taxGroups, taxTypes
  costInfos → taxGroups
  transactionTypeConfigs (standalone)
  contactDetails → contactAddressTypes
  mapProviderLocationMappers → mapProviders, locationDetails

LEVEL 2
  transactionTypes → transactionTypeConfigs
  transactionTypeBaseConversions → transactionTypeConfigs, transactionTypeStatuses
  addressDetails → contactAddressTypes, mapProviderLocationMappers
  itemDetails → categories, uom, costInfos

LEVEL 3
  branchDetails → addressDetails, contactDetails, organizations, transactionTypeConfigs
  transactionDetailLogs → transactionTypeConfigs, transactionTypeStatuses, branchDetails
  paymentModeTransactionDetails → paymentModes

LEVEL 4
  batchDetails → costInfos, uom, mapProviderLocationMappers, branchDetails
  transactionTypeConversionMappers → transactionTypeBaseConversions, transactionDetailLogs, transactionTypeStatuses
  transactionItemDetails → transactionDetailLogs, itemDetails
  branchUserGroupMappers → branchDetails
  paymentDetails → accountTypeBases, transactionDetailLogs

LEVEL 5 (deepest)
  paymentBreakups → accountTypeBases, paymentDetails, paymentModeTransactionDetails, paymentReceivedTypes
```

---

## Phase 0 — Test Infrastructure Setup

| Task | Detail |
|---|---|
| Install Playwright | `@playwright/test`, chromium + firefox |
| `playwright.config.ts` | `baseURL: localhost:3000`, retry on flake, screenshot on fail |
| API fixture layer | `page.route('/api/**')` — mock mode OR live mode |
| `GenericCrudPOM` | Single Page Object Model class parameterized by module key |
| Test data factory | Seed fixtures per module (valid + invalid data sets) |
| Auth helper | Login once, reuse session cookie across all tests |

---

## Phase 1 — Leaf Module CRUD (~60 tests)

**Standard 5 test cases per leaf module:**
1. ✅ Create with all valid fields → record appears in table
2. ❌ Create with required field empty → inline error shown, no API call
3. ✅ Edit existing record → changes persist in table
4. ❌ Edit with required field cleared → inline error shown
5. ✅ Delete → confirmation dialog shown → record removed

### Leaf Module Field Validations

| Module | Required Fields | Key Validations |
|---|---|---|
| `taxTypes` | Name(max:100), Value(0–100) | Value > 100 → error; Value < 0 → error |
| `uom` | UnitName(max:100) | Empty → error |
| `categories` | Name(max:100) | Empty → error |
| `taxGroups` | Name(max:100) | Empty → error |
| `organizations` | Name(max:200) | Empty → error |
| `transactionTypeStatuses` | Name(max:100) | Empty → error |
| `contactAddressTypes` | Name(max:100) | Empty → error |
| `mapProviders` | ProviderName(max:100) | Empty → error |
| `locationDetails` | Lat(number), Lng(number) | Non-numeric → error |
| `accountTypeBases` | Name(max:100) | Empty → error |
| `paymentModes` | Type(max:50) | Empty → error; >50 chars → error |
| `paymentReceivedTypes` | Type(max:50) | Empty → error; >50 chars → error |

---

## Phase 2 — Level 1–2 Module CRUD (~50 tests)

**Standard 7 test cases per module (5 above + 2 dropdown-specific):**
6. ❌ Submit with required select left as "Select…" → inline error per field
7. ✅ Dropdown shows correct label (matches referenced record's displayField)

| Module | FK Fields | Notes |
|---|---|---|
| `uomFactors` | PrimaryUOMId → uom, SecondaryUOMId → uom | Factor required, min 0 |
| `taxGroupTaxTypeMappers` | TaxGroupId → taxGroups, TaxTypeId → taxTypes | Both required |
| `costInfos` | TaxGroupId → taxGroups | TaxGroupId optional; dropdown label = `Amount-TaxGroupName` |
| `transactionTypeConfigs` | (no FK) | StartCounterNo min 0; Format required |
| `contactDetails` | ContactAddressTypeId → contactAddressTypes | FirstName required |
| `mapProviderLocationMappers` | MapProviderId → mapProviders, LocationDetailId → locationDetails | TagName required; dropdown shows Lat-Lng format |
| `transactionTypes` | TransactionTypeConfigId → transactionTypeConfigs | Config dropdown uses TagName label |
| `transactionTypeBaseConversions` | TransactionTypeConfigId, FromStatusId, ToStatusId → transactionTypeStatuses | Tag optional; all 3 selects required |
| `addressDetails` | ContactAddressTypeId, MapProviderLocationMapperId | TagName + AddressLine1 required |
| `itemDetails` | CategoryId → categories, UOMId → uom, CostInfoId → costInfos | Name(255) required; SKU/Barcode/HSN optional |

---

## Phase 3 — Cross-Module Integration Tests (~10 tests)

| Test | Steps | Pass Condition |
|---|---|---|
| paymentModes → paymentModeTransactionDetails | Create `"NEFT"` paymentMode → open add paymentModeTransactionDetail | `"NEFT"` appears in Payment Mode dropdown |
| accountTypeBases → paymentDetails | Create `"Savings"` accountTypeBase → open add paymentDetail | `"Savings"` appears in Account Type Base dropdown |
| accountTypeBases → paymentBreakups | Same accountTypeBase → open add paymentBreakup | Appears in paymentBreakups dropdown too |
| transactionDetailLogs → paymentDetails | Create transactionLog → open paymentDetails | Dropdown shows `TransactionNo-GrossAmount` composite label |
| taxGroups → costInfos → batchDetails | Create taxGroup → create costInfo → open batchDetail | costInfo shows `Amount-TaxGroupName` composite |
| branchDetails → transactionDetailLogs | Create branch → open add transactionLog | Branch appears in Branch dropdown |
| mapProviders + locationDetails → mapProviderLocationMappers | Create both → open add locationMapper | Both dropdowns populated |
| transactionTypeConfigs → 3 modules | Create config → check dropdowns in transactionTypes, branchDetails, transactionTypeBaseConversions | Config's TagName appears in all 3 |
| paymentDetails → paymentBreakups | Create paymentDetail → open paymentBreakups | Shows `TransactionNo-GrossAmount` format |
| **Delete propagation** | Delete a paymentMode used by a paymentModeTransactionDetail | UI shows error toast from backend (not silent fail) |

---

## Phase 4 — Level 3–5 Module CRUD (~40 tests)

| Module | FK Fields | Special Validations |
|---|---|---|
| `branchDetails` | AddressDetailId, ContactDetailId, OrganizationDetailId, TransactionTypeConfigId | BranchName required; 4 required selects; CF1-CF4 optional max 50 |
| `transactionDetailLogs` | TransactionTypeConfigId, TransactionTypeStatusId, BranchId | TransactionNo required; TransactionDate is date field (optional) |
| `paymentModeTransactionDetails` | PaymentModeId → paymentModes | RefNo optional max 50; Comment optional max 100; CF1-CF4 optional max 50 |
| `batchDetails` | CostInfoId, UOMId, MapProviderLocationMapperId, BranchDetailId | 3 required date fields; Quantity required with decimal |
| `transactionTypeConversionMappers` | TransactionTypeBaseCoversionId, TransactionDetailLogId, TransactionTypeStatusId | All 3 selects required |
| `transactionItemDetails` | TransactionDetailLogId, ItemId | Both required; Comment optional max 100 |
| `branchUserGroupMappers` | BranchId → branchDetails | UserGroupId is text (required, not a select) |
| `paymentDetails` | AccountTypeBaseId, TransactionDetailLogId | GrossAmount + TotalAmount required; UserId optional (empty string must NOT be sent to API) |

### paymentBreakups Specific Tests (12 cases)

| # | Test |
|---|---|
| 1 | ✅ All 4 dropdowns populate on modal open |
| 2 | ❌ Submit with any required select empty → error per field |
| 3 | ✅ Valid create with all required fields |
| 4 | ✅ Timestamp `2026-05-25T10:00:00` → accepted |
| 5 | ✅ Timestamp date-only `2026-05-25` → accepted |
| 6 | ❌ Timestamp field empty → "Timestamp is required" error |
| 7 | ✅ UserId empty → succeeds (empty string stripped from payload) |
| 8 | ✅ Edit existing → Timestamp pre-fills without `Z` suffix |
| 9 | ✅ Edit → save without changes → no error |
| 10 | ✅ Table shows AccountTypeName, PaymentModeRefNo, ReceivedType columns |
| 11 | ✅ PaymentDetail dropdown shows `TransactionNo-GrossAmount` format |
| 12 | ✅ Delete with confirmation |

---

## Phase 5 — Quick-Create Flow Tests (~10 tests)

| # | Module | Test |
|---|---|---|
| QC-1 | paymentBreakups → accountTypeBases | Click `+` → mini modal opens → fill Name → submit → dropdown refreshes + new record auto-selected |
| QC-2 | paymentBreakups → paymentDetails | Click `+` → paymentDetails mini modal → fill all required → submit → auto-select |
| QC-3 | paymentBreakups → paymentModeTransactionDetails | Click `+` → mini modal opens with its own paymentModes dropdown loaded → create → auto-select |
| QC-4 | paymentBreakups → paymentReceivedTypes | Click `+` → mini modal → create → auto-select |
| QC-5 | paymentDetails → accountTypeBases | Click `+` → create → auto-select in parent form |
| QC-6 | paymentDetails → transactionDetailLogs | Click `+` → mini modal has its own selects → create → auto-select |
| QC-7 | **Edit mode** | Open existing paymentBreakup for edit → click `+` next to dropdown → create new ref → verifyother fields unchanged |
| QC-8 | **Cancel QC** | Click `+` → cancel mini modal → parent form unchanged, no record created |
| QC-9 | **No recursion** | Inside QC mini modal for paymentModeTransactionDetails → `+` must NOT appear next to Payment Mode dropdown |
| QC-10 | **QC validation** | Inside QC mini modal, submit with required field empty → error shown inside mini modal, parent form unaffected |

---

## Phase 6 — Full Business Flow E2E (3 scenarios)

### Flow A — Complete Payment Chain
```
1. Create paymentReceivedType ("Full Payment")
2. Create paymentMode ("UPI")
3. Create paymentModeTransactionDetail (RefNo: "REF001", mode: UPI)
4. Create accountTypeBase ("Current Account")
5. Create transactionTypeConfig (TagName, Format, StartCounter)
6. Create transactionTypeStatus ("Open")
7. Create organization, contactAddressType, contactDetail, addressDetail
8. Create branchDetails (refs org + contact + address + config)
9. Create transactionDetailLog (TxNo: "TXN001", branch + config + status)
10. Create paymentDetail (AccountType: Current, Log: TXN001, GrossAmount, TotalAmount)
11. Create paymentBreakup (all 4 FKs filled, Timestamp set)
VERIFY: paymentBreakup table shows AccountTypeName, PaymentModeRefNo, ReceivedType columns
```

### Flow B — Inventory Chain
```
1. Create taxGroup → costInfo (Amount-TaxGroup label)
2. Create category → uom → itemDetail (refs category + uom + costInfo)
3. Create mapProvider → locationDetail → mapProviderLocationMapper
4. Create organization + contactAddressType + contactDetail + addressDetail
5. Create transactionTypeConfig + branchDetail (refs org + contact + address + config)
6. Create batchDetail (refs costInfo + uom + locationMapper + branch)
VERIFY: batchDetail table shows resolved names in all FK columns
```

### Flow C — Transaction Processing Chain
```
1. Create transactionTypeConfig + 2x transactionTypeStatuses ("Draft", "Approved")
2. Create transactionTypeBaseConversion (Draft → Approved)
3. Create transactionDetailLog (status: Draft)
4. Create transactionTypeConversionMapper (refs baseConversion + log + status)
5. Create itemDetail → Create transactionItemDetail (refs log + item)
VERIFY: transactionTypeConversionMapper table shows Tag, TransactionNo, StatusName
```

---

## Phase 7 — Edge Cases & Regression (~15 tests)

| Test | Description |
|---|---|
| Table search | Search term filters rows in all searchable modules |
| Pagination | Page 2 loads different records; page size respected |
| Refresh button | Reloads table without page navigation |
| Column sort | Click header → A→Z; click again → Z→A |
| Empty state | Table shows "No X found" message when no records exist |
| API 500 error toast | Mock API 500 → error toast appears with message |
| API 400 validation toast | Mock API 400 `{"message": "..."}` → toast shows server message |
| Boolean default | Active checkbox defaults to checked on create form open |
| maxLength enforcement | Input stops accepting characters at declared maxLength |
| `expand=true` columns | AccountTypeName, PaymentModeType show resolved names not raw UUIDs |
| Modal close on backdrop | Click outside modal → modal closes, no data saved |
| Concurrent navigation | Navigate away mid-form → modal closes cleanly on return |
| System fields not sent | CreatedOn, UpdatedOn, CreatedBy never appear in POST/PUT payloads |
| Empty optional string | Optional text fields left blank → key absent from payload (not `""`) |
| Toast auto-dismiss | Success toast disappears after 3 seconds; error after 5 |

---

## Execution Order Summary

| Phase | What | Est. Tests |
|---|---|---|
| 0 | Infrastructure setup | — |
| 1 | Leaf module CRUD + validation | ~60 |
| 2 | Level 1–2 module CRUD + dropdown | ~50 |
| 3 | Cross-module integration | ~10 |
| 4 | Level 3–5 CRUD + paymentBreakups | ~40 |
| 5 | Quick-create flows | ~10 |
| 6 | Full business flow E2E | ~15 |
| 7 | Edge cases + regression | ~15 |
| **Total** | | **~200** |

---

## Open Decisions (to confirm before implementation)

1. Run against **live API** or **mocked API** (or both)?
2. Test data: **fresh per test** (isolated, slower) or **shared fixtures** (faster, order-dependent)?
3. Any modules to **exclude** (commented-out `accountTypes` already excluded)?
4. Should delete tests actually delete, or use a **soft-delete / deactivate** approach?
5. Auth: is there a login page, or is the app accessible without auth at `localhost:3000`?
