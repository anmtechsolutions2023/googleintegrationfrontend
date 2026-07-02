# Multi-Tenant Auth App — Validation Test Plan & Code Map

**App under test:** tenant-auth-ui (React) + googleintegrationbackend (Express/MySQL)
**Login URL:** http://localhost:3000/login · **API base:** http://localhost:3001
**Accounts:** Super admin `anmtechsolutions2023@gmail.com` · Tenant `3mineverything@gmail.com`
**Generated:** Phase 1–2 (static analysis). Phase 3 results recorded separately.

---

## 1. Architecture & identity model (from code)

- **Auth:** `POST /api/auth/google` takes a Google ID token, verifies it with `google-auth-library`, then looks up `user_tenants`. Provisioned users get a full JWT; unprovisioned users get a **guest JWT (15 min)** with only `guest:explore` and an `onboarding_requests` row is created.
- **JWT payload:** `{ email, name, tid (tenant id, null for guest), scopes[], onboardingStatus, roles[], associatedTenants[], iss }`. Stored client-side in a **cookie** (`js-cookie`), decoded in `AuthContext`. **No server-side session store.**
- **Identity & tenant scope on the server:** every controller derives tenant from `req.user.tid` (the JWT), via `extractUserContext`. Master-data SQL is all `WHERE TenantId = ?` bound to that tid. **Tenant scope is never taken from the URL or body** (except the audit `tenantId` filter, which is super-admin only, and the approve `tenantId`).
- **Scope enforcement:** `authMiddleware.checkScope(...)` — passes if the user has any required scope; **`TENANT:SUPER_ADMIN` bypasses all scope checks**. `authenticateToken` returns **401** when the token is *missing*, **403** when the token is *present but invalid/expired*.

## 2. Role model — Super Admin vs Tenant

| Capability | Super Admin (`TENANT:SUPER_ADMIN`) | Tenant user (`3mineverything`) |
|---|---|---|
| Scope check | Bypasses **all** `checkScope` gates | Only what its roles/features + `is_admin`/direct grants give |
| Admin IAM panel `/admin/*` (`admin:access`) | Yes (bypass) | Only if granted `admin:access` |
| Approve/reject onboarding, manage users/roles/features | Yes | Only with `admin:access`, **scoped to its own `tid`** |
| Audit logs | All tenants/users; may filter by any `tenantId` | Tenant-admin → own tenant; else only own rows |
| Master-data **read** (`GET /api/{module}`) | Yes | **Any authenticated user** (no scope required) — but only own `tid` rows |
| Master-data **write** (POST/PUT/DELETE) | Yes | Needs `TENANT:ADMIN` / `MASTER_DATA:WRITE` (etc.) |
| Reports (`/reports`) | Yes | Needs `reports:READ/WRITE` or `TENANT:ADMIN` |
| Tenant switch (`POST /api/tenants/switch`) | Yes | Only to a tenant in its own `associatedTenants` |

## 3. Dependency map (parent → child)

```
Super Admin
  └─ Onboarding request (created when 3mineverything first logs in → guest)
       └─ Approve (PUT /api/admin/onboarding/:id/approve { tenantId, roleIds })
            ├─ inserts user_tenants(email, tenantId)   ← "tenant created/provisioned"
            └─ inserts user_roles(email, tenantId, roleId)
                 └─ roles → role_permissions → features  → scopes at next login
       └─ Lifecycle: edit roles / suspend (status) / delete (remove user)
            └─ Effect realized ONLY at next login/token refresh (JWT is stateless)
```

> **Note on "tenant lifecycle":** there is **no tenant-CRUD API**. "Creating a tenant" = approving an onboarding request and provisioning the user into a `tenantId` (typed free-text in the Approve modal). Suspend = `PUT /api/admin/users/:email/status {SUSPENDED}`; delete = `DELETE /api/admin/users/:email`.

## 4. Routes & guards (frontend)

| Route | Guard | Notes |
|---|---|---|
| `/login` | public | Google sign-in |
| `/forbidden` | public | |
| `/` | redirect → `/dashboard` | |
| `/audit` | **NONE (open)** | ⚠ no `ProtectedRoute` — see Finding S-4 |
| `/onboarding` | `GuestRoute` | guests only |
| `/dashboard` | `ApprovedRoute` | provisioned users |
| `/reports` | `ApprovedRoute` + `ScopeGuard[reports:READ/WRITE, TENANT:ADMIN]` | ⚠ scope string case mismatch — Finding S-5 |
| `/admin/settings` | `ApprovedRoute` + `ScopeGuard[TENANT:ADMIN]` | legacy AdminPage |
| `/admin/*` | `ApprovedRoute` + `ScopeGuard[admin:access]` | IAM panel (approvals/users/roles/features) |
| `/master`, `/master/:moduleKey` | `ApprovedRoute` | 31 CRUD modules |
| `*` | NotFound | |

## 5. Pre-identified static findings (verify dynamically in Phase 3)

- **S-1 (High) — Stateless suspend/delete:** suspending or deleting a user does **not** invalidate an existing JWT (no server session/denylist; `logout` just returns 200). A suspended/deleted tenant keeps full access until the token expires. Test in Chain B.
- **S-2 (High) — Role-permissions IDOR:** `getRolePermissions(roleId)` / `GET /api/admin/roles/:roleId/permissions` is **not tenant-scoped** — only `roleId`. An admin in tenant A may read tenant B's role permissions. Feature endpoints are global too. Test in Chain D.
- **S-3 (Med) — Expiry returns 403 but interceptor only handles 401:** `api.js` clears the cookie + redirects only on **401**; backend returns **403** for expired/invalid tokens, so an expired session is **not** auto-logged-out/redirected. Test in Chain A.
- **S-4 (Med) — `/audit` route unguarded client-side:** reachable while logged out (no redirect to `/login`); backend still 401/403s the data call. Contradicts the "protected URL → redirect" requirement. Test in Chain A/C.
- **S-5 (Low/Med) — Reports scope case mismatch:** frontend `scopes.js` uses `reports:READ`/`reports:WRITE`; backend constants use `REPORTS:READ`/`REPORTS:WRITE`. Guard vs server may disagree depending on DB feature naming. Test in Reports module.
- **S-6 (Low) — `decodeToken` ignores `exp`:** `AuthContext` loads the user from the cookie without checking expiry, so the UI looks logged-in with an expired token until an API call fails. Test in Chain A.

---

## 6. Use-case matrix (per module: happy / empty-loading / invalid / edge)

### Auth & session
- Google login — super admin (happy); tenant (happy); unprovisioned → guest/onboarding (edge); cancel Google (deny path); network error.
- Logout clears cookie + redirects; back button after logout must not expose app.
- Refresh keeps session (cookie persists). Expired token behavior (S-3/S-6).
- Visit protected URL while logged out → redirect to `/login` (test each: /dashboard, /master, /admin, /reports, /audit↯).

### Onboarding (guest)
- Pending banner; save note (happy/empty/too-long 500 cap); check-status refresh; rejected shows reason; approved guest auto-redirect to dashboard.

### Admin · Approvals
- List PENDING/APPROVED/REJECTED/ALL + search; empty state; approve with valid tenantId (happy); approve with **empty tenantId** (client blocks; API would 400 non-uuid); approve with roles; re-approve already-reviewed (404); reject with/without reason.

### Admin · Users / Roles / Features
- List/empty; create role (happy/duplicate/empty name); edit; delete system role (403 protected); role permissions get/set; create feature (happy/dup); delete feature in use (409); update user roles; suspend/activate; remove user.

### Master Data (31 modules, representative: Tax Types, UOM, Categories, Item Details)
- List (happy/empty/loading); create (happy/required-missing/maxLength/number bounds); edit; delete; search/pagination; FK select dependencies.

### Reports / Data / Audit
- Reports list/billing by scope; data/settings needs TENANT:ADMIN; audit tier visibility (super=all, tenant-admin=own tenant, self=own rows) + filters.

## 7. Integration & security chains (explicit)

**A. Auth lifecycle:** login both accounts → logout → refresh persists → expiry/refresh → protected-URL-while-logged-out redirects.

**B. Super-admin → tenant dependency:** SA approves/provisions 3mineverything → appears in SA Users list → tenant logs in, correctly scoped → SA edits roles / suspends / deletes → verify propagation (lose access on next login; **existing session** behavior per S-1; references handled, not broken).

**C. Authorization boundary (NEGATIVE — most important):** as the **tenant**, attempt every super-admin-only action three ways: (1) UI, (2) manual super-admin route URL, (3) replay the super-admin API call directly (devtools/Network). Backend MUST return 401/403 each time. Targets: `GET/PUT /api/admin/onboarding*`, `/api/admin/users*`, `/api/admin/roles*`, `/api/admin/features*`, `GET /api/data/settings`, audit cross-tenant filter.

**D. Tenant isolation:** as the tenant, try to read/modify another tenant's data by changing IDs in URLs and API bodies — master-data `:id`, `roles/:roleId/permissions` (S-2), audit `?tenantId=`, approve into a foreign `tenantId`.

**E. Google integration:** OAuth connect/consent (both accounts); token storage (cookie); disconnect/revoke (logout); re-auth; cancel/deny/error paths.

## 8. Evidence captured per case
pass/fail · exact steps · console errors · network request+response (status) · screenshot on every failure.
