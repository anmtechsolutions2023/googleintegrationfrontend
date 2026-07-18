# POS Front Desk — Frontend Plan (tenant-auth-ui)

Frontend counterpart to the backend plan (`POS_INTEGRATION_PLAN.md` in `googleintegrationbackend`).
Ports the **RestroOS** POS into this React app as a new **Front Desk** section, mirroring the
existing patterns (AuthContext, scope guards, config-driven CRUD engine, dynamic FormModal).

**Guiding principle:** additive & pattern-conformant. Reuse the battle-tested building blocks;
do not modify existing Master Data / Admin / Reports / Audit flows. Everything is JWT-scope-gated.

---

## 1. Existing building blocks we REUSE (do not rebuild)

| File | Reused for |
|---|---|
| `src/context/AuthContext.js` (`useAuth`) | JWT/user/scopes; POS reads `user.scopes`, `user.tid` |
| `src/api/api.js` | axios instance — Bearer token + 401 handling already built-in |
| `src/components/Guards.js` (`ApprovedRoute`, `ScopeGuard`) | gate `/frontdesk/*` |
| `src/utils/permissions.js` (`hasScope`, category maps) | per-link & per-control gating |
| `src/services/crudService.js` | generic CRUD calls (drives config-style POS screens) |
| `src/components/MasterData/FormModal.js` | dynamic form (text/number/boolean/select/textarea/date/datetime/email) |
| `src/components/MasterData/DataTable.js` | list/pagination/edit/delete rows |
| `src/components/MasterData/ConfirmDialog.js` | delete confirmation |
| `src/constants/*` (routes, scopes, strings) | extend, not replace |

**Key reuse insight:** RestroOS's config-style screens (Menu Master, Floors/Tables setup, Taxes)
are plain CRUD → they can be driven by the **existing** `FormModal` + `DataTable` + `crudService`
purely through config. Only the **operational** screens (Billing & KOT, KDS, live Tables, Dashboard)
need bespoke components.

---

## 2. New files to add (all under a self-contained Front Desk area)

```
src/
├── config/
│   └── posModules.js            # POS CRUD registry (mirrors config/modules.js, POS categories)
├── constants/
│   └── posScopes.js             # POS_* scope constants (or extend constants/scopes.js)
├── services/
│   └── posService.js            # replaces RestroOS js/db.js — all POS API calls
├── context/
│   └── FrontDeskContext.js      # replaces the global `restrosDB` object; backend-hydrated state
├── components/frontdesk/
│   ├── FrontDeskLayout.js       # mirrors MasterDataLayout (shell + sidebar + <Outlet/>)
│   ├── FrontDeskSidebar.js      # mirrors MasterData/Sidebar; scope-gated POS tabs
│   ├── PosCrudPage.js           # thin wrapper over FormModal+DataTable+posCrudService
│   └── frontdesk.css            # ported RestroOS css, namespaced under `.frontdesk`
└── pages/frontdesk/
    ├── FrontDeskDashboard.js    # KPIs (revenue, orders, tables, pending KOTs)
    ├── Billing.js               # Billing & KOT (POS grid, cart, fire KOT, settle)
    ├── Tables.js                # live floor/table occupancy
    ├── MenuMaster.js            # config-CRUD (reuses PosCrudPage)
    ├── Kitchen.js               # KDS board (mark-ready)
    ├── OnlineOrders.js, Tracking.js, Inventory.js, Crm.js,
    ├── Feedback.js, Tokens.js, Expenses.js, Reports.js, AccessControl.js
```

---

## 3. Routing & guards (`src/App.js` + `src/constants/routes.js`)

Add to `routes.js`:
```js
FRONTDESK: '/frontdesk',
FRONTDESK_MODULE: '/frontdesk/:tab',
```

Add to `App.js` (mirrors the Master Data nested-route block):
```jsx
<Route path={`${ROUTES.FRONTDESK}/*`} element={
  <ApprovedRoute>
    <ScopeGuard requiredScopes={[
      SCOPES.POS_ORDER_READ, SCOPES.POS_CONFIG_READ, SCOPES.POS_KITCHEN_READ,
      SCOPES.POS_BILLING_READ, SCOPES.POS_CRM_READ, SCOPES.POS_OPS_READ,
      SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN,
    ]}>
      <FrontDeskLayout />
    </ScopeGuard>
  </ApprovedRoute>
}>
  <Route index element={<FrontDeskDashboard />} />
  <Route path="billing"  element={<ScopeGuard requiredScopes={[SCOPES.POS_ORDER_READ,  SCOPES.TENANT_ADMIN]}><Billing /></ScopeGuard>} />
  <Route path="tables"   element={<ScopeGuard requiredScopes={[SCOPES.POS_ORDER_READ,  SCOPES.TENANT_ADMIN]}><Tables /></ScopeGuard>} />
  <Route path="menu"     element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ, SCOPES.TENANT_ADMIN]}><MenuMaster /></ScopeGuard>} />
  <Route path="kitchen"  element={<ScopeGuard requiredScopes={[SCOPES.POS_KITCHEN_READ,SCOPES.TENANT_ADMIN]}><Kitchen /></ScopeGuard>} />
  {/* ...remaining tabs, each ScopeGuard-wrapped by its POS_* category... */}
</Route>
```
Guards reused verbatim — `ApprovedRoute` bounces guests to `/onboarding`; `ScopeGuard` renders
`Forbidden` when scope missing. Super-admin bypass already lives in `hasScope`.

---

## 4. Navigation (`src/components/Navbar.js` + `constants/strings.js`)

Add a **"Front Desk"** link next to Master Data / Audit, scope-gated (desktop + mobile blocks):
```jsx
{hasScope(user, [SCOPES.POS_ORDER_READ, SCOPES.POS_CONFIG_READ, SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN]) && (
  <Link to={ROUTES.FRONTDESK}>{STRINGS.nav.frontDesk}</Link>
)}
```
Add `STRINGS.nav.frontDesk = 'Front Desk'`. The internal FrontDesk sidebar (per-tab) uses
`hasScope`/`hasCategoryAccess` so cashiers see only their tabs.

---

## 5. Scopes (`src/constants/scopes.js` — extend the SCOPES map)

Mirror the backend `feature_short_name:scope` strings exactly:
```js
POS_CONFIG_READ: 'POS_CONFIG:READ',   POS_CONFIG_WRITE: 'POS_CONFIG:WRITE',
POS_ORDER_READ:  'POS_ORDER:READ',    POS_ORDER_WRITE:  'POS_ORDER:WRITE',
POS_KITCHEN_READ:'POS_KITCHEN:READ',  POS_KITCHEN_WRITE:'POS_KITCHEN:WRITE',
POS_BILLING_READ:'POS_BILLING:READ',  POS_BILLING_WRITE:'POS_BILLING:WRITE',
POS_CRM_READ:    'POS_CRM:READ',      POS_CRM_WRITE:    'POS_CRM:WRITE',
POS_OPS_READ:    'POS_OPS:READ',      POS_OPS_WRITE:    'POS_OPS:WRITE',
POS_REPORTS_READ:'POS_REPORTS:READ',
```
Extend `utils/permissions.js` `CATEGORY_READ_SCOPE`/`CATEGORY_WRITE_SCOPE` with the POS categories
so config-CRUD screens auto-gate write buttons the same way Master Data does.

---

## 6. Two screen archetypes

**A. Config-CRUD screens** (Menu Master, Floors, Tables setup, POS Taxes) — **reuse the engine.**
Add entries to `config/posModules.js` (same shape as `config/modules.js`: `endpoint`, `fields[]`,
`tableColumns[]`, `category`, `displayField`, `searchFields`). `PosCrudPage` wires `FormModal` +
`DataTable` + a `posCrudService` (a copy of `crudService` pointed at `posModules`, or generalize
`crudService` to accept a registry — preferred, OCP). Zero new form code.

Example (`posModules.js`):
```js
posFloors: { key:'posFloors', name:'Floors', endpoint:'/api/pos/floors',
  category: POS_CATEGORIES.CONFIG, displayField:'Name',
  fields:[ {name:'Name',type:'text',required:true,maxLength:100},
           {name:'Active',type:'boolean',default:true} ],
  tableColumns:['Name','Active','CreatedBy','CreatedOn'], searchFields:['Name'] }
```

**B. Operational screens** (Billing & KOT, KDS, live Tables, Dashboard) — **bespoke React**, ported
from RestroOS `js/billing.js|tables.js|dashboard.js|app.js`. State comes from `FrontDeskContext`
(not `restrosDB`); every mutation calls `posService` → backend (which audit-logs it).

---

## 7. State: `FrontDeskContext` + `posService` (replaces `restrosDB`/`js/db.js`)

- `js/db.js` (`initDB`/`saveDB`/localStorage) is **dropped**. The old global `restrosDB` shape is
  preserved as context state, but **hydrated from and persisted to the backend**.
- `posService.js` exposes typed calls over `api/api.js`, e.g. `getFloors()`, `getTables(branchId)`,
  `createOrder()`, `fireKot(orderId)`, `markKotReady(kotId)`, `settleBill(orderId, payments)`,
  `getDashboard()`. Each maps to a `/api/pos/*` endpoint.
- `FrontDeskContext` provides `{ floors, tables, menu, activeOrder, kots, ... , refresh() }` and
  optimistic updates with toast feedback (`react-toastify`, already configured).
- Branch: POS is branch-scoped; the active `BranchId` (from user/branch selection) is passed to
  branch-filtered endpoints.

Response envelope: `crudService` already normalizes the API's `{success, data, message[]}` shape —
`posService` follows the same normalization so lists render consistently.

---

## 8. Per-tab mapping

| Tab | Type | Component | Scope (read) | Backend |
|---|---|---|---|---|
| Dashboard | bespoke | FrontDeskDashboard | POS_REPORTS_READ | `/api/pos/dashboard` |
| Billing & KOT | bespoke | Billing | POS_ORDER_READ | `/api/pos/orders`,`/kots`,`/bills` + `itemdetail` |
| Tables | bespoke | Tables | POS_ORDER_READ | `/api/pos/tables`,`/floors` |
| Menu Master | config-CRUD | MenuMaster | POS_CONFIG_READ | `itemdetail`,`category`,`taxtypes` + `/api/pos/item-meta` |
| Kitchen (KDS) | bespoke | Kitchen | POS_KITCHEN_READ | `/api/pos/kots` |
| Online Orders | bespoke | OnlineOrders | POS_OPS_READ | `/api/pos/online-orders` |
| Live Tracking | bespoke | Tracking | POS_OPS_READ | `/api/pos/online-orders` |
| Inventory | config-CRUD | Inventory | INVENTORY_READ | existing inventory + `/api/pos/*` |
| CRM & Loyalty | config-CRUD/bespoke | Crm | POS_CRM_READ | `/api/pos/customers` |
| Feedback | config-CRUD | Feedback | POS_CRM_READ | `/api/pos/feedback` |
| Token System | bespoke | Tokens | POS_OPS_READ | `/api/pos/tokens` |
| Expenses | config-CRUD | Expenses | POS_OPS_READ | `/api/pos/expenses` |
| Reports | bespoke | Reports | POS_REPORTS_READ | `/api/pos/reports` |
| Access Control | read-only view | AccessControl | TENANT_ADMIN | existing `/api/admin/*` roles |

Note: audit logging is entirely a **backend** concern — the frontend just calls the endpoints,
which are `auditLogCrud`/`auditLog` wrapped, so admin/super-admin see every POS action.

---

## 9. SOLID on the frontend
- **SRP:** presentation (pages) vs data access (`posService`) vs shared state (`FrontDeskContext`)
  vs config (`posModules`). No component talks to axios directly except through the service.
- **OCP:** new tabs = new config entry / new page + route; no edits to existing components.
  Preferred: generalize `crudService` to accept a module registry so both Master Data and POS use
  one engine (open for extension, closed for modification).
- **DIP:** pages depend on the `posService`/context abstractions, not `api/api.js` directly.
- **ISP:** small focused context/service surfaces per concern (orders vs menu vs kds).

## 10. Styling
Port `css/style.css` into `frontdesk.css` scoped under a `.frontdesk` root wrapper so RestroOS
styles never leak into existing app pages. Keep responsive/mobile behavior (matches the app's
responsive requirement).

## 11. Testing (match existing RTL patterns under `__tests__/`)
- Unit: `posService` (mock axios), `FrontDeskContext` reducers.
- Component (RTL): scope-gated rendering (link hidden without scope, `Forbidden` on guarded route),
  Billing add-to-cart/fire-KOT, KDS mark-ready.
- Reuse existing `setupTests.js`; add fixtures for POS entities.

## 12. Phased delivery (frontend)
0. **Shell:** routes + `FrontDeskLayout`/`FrontDeskSidebar` + Navbar link + scopes + namespaced css
   (tabs stubbed). Proves scope-gated mount, zero risk to existing pages.
1. **Menu Master + Dashboard:** first backend-wired screens (reuse CRUD engine + dashboard service).
2. **Tables + Billing & KOT + KDS:** the operational core via `posService`/`FrontDeskContext`.
3. **Inventory + CRM + Payments settlement.**
4. **Stub tabs** (online orders, tracking, feedback, tokens, expenses, access control view).
5. **Hardening:** RTL tests, responsive polish, empty/error states.

## 13. Non-breaking guarantees
- Only additions: new files + new lines in `App.js`, `routes.js`, `scopes.js`, `permissions.js`,
  `strings.js`, `Navbar.js`. Existing Master Data / Admin / Reports / Audit code paths unchanged.
- POS CSS namespaced under `.frontdesk`; no global style bleed.
- If a user lacks POS scopes, the nav link, routes, and controls are all hidden/forbidden — no
  behavior change for existing non-POS users.
