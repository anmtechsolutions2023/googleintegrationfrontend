I need your help to perform a **complete end-to-end audit of our tenant onboarding workflow and understand how tenant information propagates throughout the system**.

Please do not give me a high-level or generic explanation. I want you to **inspect the existing codebase, database/models, APIs, UI screens, configuration, receipts/prints, reports, and related workflows** and build a complete picture of how the information entered during tenant onboarding flows through the application.

## 1. First: Understand the Existing System

Before making any recommendations, understand:

- How tenant onboarding currently works
- Where the onboarding wizard is implemented
- What fields are currently shown in the wizard
- Which fields are mandatory/required
- Which fields are optional
- Where the onboarding data is stored
- Which APIs/services are called during onboarding
- Which database tables/models/entities store the information
- How the tenant profile/company/property information is represented
- How these values are subsequently consumed by other features

If anything is unclear from the codebase, **ask me specific questions before making assumptions**.

Do not assume that a field exists just because it would normally be expected in a system like this.

---

# 2. Create a Complete Field Inventory

I want you to create a master inventory of **every field collected during tenant onboarding**.

For each field, provide:

| Field | Required/Optional | Onboarding Screen | Database/Table | API | Where Used | Can Be Updated Later? | Update Location | Appears on Receipt/Print? |
| ----- | ----------------- | ----------------- | -------------- | --- | ---------- | --------------------- | --------------- | ------------------------- |

For every field, trace its complete journey:

**Onboarding Wizard → API → Backend → Database → Other Features/UI → Receipt/Print/Report**

I specifically want to know whether the value entered during onboarding actually propagates correctly throughout the application.

---

# 3. Tenant Onboarding Wizard

Analyze the onboarding wizard in detail.

Tell me:

### Current fields

- What fields are currently being requested?
- Which are required?
- Which are optional?
- What validation exists?
- What default values exist?
- What happens if the user skips an optional field?
- What happens if the user enters invalid information?

### Fields I specifically want investigated

Please pay particular attention to:

- Tenant/business/property name
- Address
- Contact information
- GST-related information
- GST registration/license number
- GST enabled/disabled configuration
- FSSAI license information
- Any other tax/business registration information
- Branding information
- Logo/business name used for receipts
- Any configuration that affects billing
- Any configuration that affects receipts
- Any configuration that affects reports

Do not limit the investigation to these fields. Identify **all other relevant onboarding fields from the actual codebase**.

---

# 4. GST Configuration — Very Important

We have a configuration where **GST billing can be turned ON or OFF**.

I need you to investigate this completely.

Please determine:

1. Where is the GST ON/OFF configuration stored?
2. What is the exact field/flag name?
3. What is the default value?
4. Where can the tenant enable/disable it?
5. Is this configuration collected during onboarding?
6. If not, where is it configured?
7. What UI changes when GST is ON?
8. What UI changes when GST is OFF?
9. What APIs behave differently?
10. What database values change?
11. What happens to invoices/receipts when GST is ON?
12. What happens when GST is OFF?
13. Does GST information appear on:

- Receipts
- Invoices
- Prints
- Reports
- PDFs
- Emails
- Other documents

14. If GST is enabled later after onboarding, does previously entered tenant information automatically become available?
15. If GST is disabled later, what happens to existing data?
16. Can GST registration/license number be updated later?
17. Where exactly can an administrator update it?

I want the **actual implementation flow**, not assumptions.

---

# 5. FSSAI License

We also have **FSSAI licensing information**.

I want you to investigate whether FSSAI information can be captured during onboarding.

Specifically:

- Is FSSAI information currently part of the onboarding wizard?
- If yes:
  - Which fields?
  - Required or optional?
  - Where are they stored?
  - Which API handles them?
  - Which database field/table stores them?

- If not:
  - Is there already a place in the application where it can be entered?
  - Which screen?
  - Which backend/API?
  - Which database field?

- Can it be added as an **optional onboarding field** without breaking existing tenants?
- Where should the FSSAI information propagate?
- Does it currently appear on receipts, invoices, prints, reports, PDFs, etc.?
- If it does not currently appear anywhere, identify the appropriate existing document/UI components where it could be displayed.

Again, distinguish between:

**Already implemented**
vs.
**Partially implemented**
vs.
**Not implemented**

Do not assume something exists.

---

# 6. Information Propagation Map

This is one of the most important parts.

For every onboarding field, create a propagation map.

For example:

```text
Tenant Onboarding Wizard
        ↓
Frontend Form
        ↓
API Request
        ↓
Backend Service
        ↓
Database
        ↓
Tenant Configuration/Profile
        ↓
Billing
        ↓
Receipt
        ↓
Print/PDF
        ↓
Reports
```

I want you to identify exactly where each piece of information goes.

For example:

```text
GST License Number
    ↓
Onboarding Wizard
    ↓
POST /api/tenant/...
    ↓
Tenant Configuration
    ↓
Database: ______
    ↓
Billing Screen
    ↓
Invoice
    ↓
Receipt
    ↓
PDF Print
```

Use actual file names, component names, API names, model names, table names, and routes from the codebase wherever possible.

---

# 7. Where Can Information Be Updated Later?

This is extremely important.

For every onboarding field, tell me:

### Initial entry

Where is the information entered during onboarding?

### Later update

After onboarding is complete:

- Can the field be changed?
- Which screen allows the change?
- Which UI component?
- Which route/page?
- Which API?
- Which database record gets updated?
- Does the change immediately reflect everywhere else?
- Are there any cached values or duplicated values that could become inconsistent?

Create a table like:

| Field | Entered During Onboarding | Can Edit Later? | Edit Screen | API | Database | Propagates Automatically? |
| ----- | ------------------------- | --------------- | ----------- | --- | -------- | ------------------------- |

If there is **no existing update mechanism**, explicitly say:

> "No existing update path found."

Then identify what would be required to implement one.

---

# 8. Receipts, Prints, Invoices & Reports

I want you to trace all tenant information into the actual generated documents.

Inspect:

- Receipts
- Invoices
- Print views
- PDF generation
- Reports
- Billing documents
- Any other customer-facing documents

For each document, tell me:

| Document | Tenant Name | Address | GST Number | GST Status | FSSAI | Other Tenant Info | Source |
| -------- | ----------- | ------- | ---------- | ---------- | ----- | ----------------- | ------ |

Most importantly, verify whether the document is getting information from:

- Tenant profile
- Tenant configuration
- Billing configuration
- Hardcoded values
- Another database table
- API response
- Local/frontend state

I want to identify any places where the same information may be stored in multiple places.

---

# 9. Identify Duplicate or Inconsistent Sources of Truth

Look specifically for cases where the same information is stored separately.

For example:

```text
Tenant GST Number
    ├── Tenant Profile
    ├── Tenant Settings
    ├── Billing Configuration
    └── Invoice Configuration
```

If this happens, tell me:

- Which one is the source of truth?
- Which components read from which source?
- Could they become inconsistent?
- If the value changes, which screens update?
- Which screens might continue showing an old value?

Identify all such potential inconsistencies.

---

# 10. Existing Tenants vs New Tenants

Analyze backward compatibility.

If we modify the onboarding wizard to add optional fields such as FSSAI information:

- What happens to existing tenants?
- Will existing tenants have NULL/empty values?
- Will migrations be required?
- Will existing receipts continue working?
- Will existing invoices continue working?
- Could adding new fields break existing onboarding?
- Could enabling GST for an existing tenant cause any problems?

Clearly separate:

**New Tenant Flow**

from

**Existing Tenant Flow**

---

# 11. UI/Page Inventory

Create a complete list of all relevant UI pages.

For example:

| Page | Purpose | Tenant Information Displayed | Can Edit? | Related API |
| ---- | ------- | ---------------------------- | --------- | ----------- |

I want to know exactly **which screen I need to go to if I want to change a particular tenant detail later**.

For example:

> To change GST License Number → Settings → Business Information → GST section → Save

But only provide this if that actual flow exists in the codebase.

---

# 12. End-to-End Test Scenarios

After understanding the implementation, create test scenarios that we can use to verify the workflow.

At minimum include:

### Scenario 1 — New tenant, GST OFF

Create a tenant with minimum onboarding information.

Verify:

- Database
- UI
- Billing
- Receipt
- Print
- Reports

### Scenario 2 — New tenant, GST ON

Create a tenant with GST enabled.

Verify:

- GST number
- Tax configuration
- Billing
- Invoice
- Receipt
- Print
- Reports

### Scenario 3 — FSSAI provided

Create a tenant with FSSAI information.

Verify where the information appears.

### Scenario 4 — Optional fields skipped

Create a tenant without optional information.

Verify that:

- Onboarding succeeds
- UI works
- Receipts work
- Reports work
- No broken/undefined values appear

### Scenario 5 — Update tenant information later

Change:

- Tenant name
- Address
- GST number
- GST status
- FSSAI information

Then verify whether every dependent screen/document reflects the change.

---

# 13. Identify Gaps

At the end, create a section called:

## Gaps / Missing Functionality

Identify:

- Fields missing from onboarding
- Fields that should be optional but aren't
- Fields collected but not propagated
- Fields stored but not displayed
- Fields displayed but not editable
- Fields duplicated across multiple sources
- Receipts missing required information
- Reports missing required information
- GST configuration inconsistencies
- FSSAI gaps
- Missing update screens
- Missing APIs
- Missing database fields
- Validation problems
- Migration requirements
- Potential backward-compatibility problems

Clearly categorize each item as:

**Implemented / Partially Implemented / Missing / Needs Investigation**

---

# 14. Recommended Target Architecture

Only AFTER understanding the existing implementation, propose a clean target workflow.

The desired conceptual flow should be:

```text
Tenant Onboarding
        ↓
Tenant Master/Profile
        ↓
Tenant Configuration
        ↓
Billing Configuration
        ↓
GST Configuration
        ↓
FSSAI Configuration
        ↓
All Tenant-Facing Features
        ↓
Receipts / Invoices / Prints / Reports
```

Recommend a **single source of truth** wherever practical.

Explain which information belongs to:

- Tenant Profile
- Business Information
- Tax Configuration
- Billing Configuration
- Compliance Information
- Feature Configuration

Do not redesign the system unnecessarily. First understand what exists, then recommend the minimum changes required.

---

# 15. Important: Do Not Make Assumptions

This is critical.

If you cannot find something in the codebase, do NOT assume it exists.

Use explicit labels:

- ✅ Confirmed — found in code
- ⚠️ Partially implemented
- ❌ Not found / not implemented
- ❓ Needs clarification

If you find conflicting implementations, point them out.

If you need additional business context to determine the correct behavior, **stop and ask me the specific question before deciding**.

---

# 16. Final Deliverable

At the end, give me a clear report in this structure:

## A. Executive Summary

Explain the current onboarding architecture in simple language.

## B. Current Onboarding Fields

Complete field inventory.

## C. Field Propagation Matrix

Show where every field goes.

## D. GST Flow

Complete GST ON/OFF workflow.

## E. FSSAI Flow

Current implementation + gaps.

## F. UI/Page Map

Where information is entered, viewed and updated.

## G. Database/API Map

Show the backend flow.

## H. Receipt/Invoice/Print/Report Mapping

Show exactly where tenant information appears.

## I. Update/Edit Workflow

Show how each field can be changed after onboarding.

## J. Existing vs New Tenant Impact

Explain backward compatibility.

## K. Gaps & Risks

Identify missing or inconsistent functionality.

## L. Recommended Changes

Only recommend changes based on the actual codebase findings.

## M. End-to-End Test Plan

Provide test cases to validate the complete workflow.

---

# Most Important Objective

My ultimate goal is to answer this simple question:

> **"If I enter tenant information once during onboarding, can I confidently know where that information is stored, where it is used, where it appears, and where I can update it later?"**

I want a **complete traceability map from onboarding → database → APIs → UI → billing → GST → FSSAI → receipts → prints → reports → future updates**.

Please inspect the codebase thoroughly before answering.

If you encounter any ambiguity about business behavior or requirements that cannot be determined from the code, **ask me questions first rather than making assumptions**.
