# Master Setup Gate — Frontend Plan

Companion to `MASTER_SETUP_GATE_PLAN.md` in the backend repo. Until a tenant
completes `/master-setup`, its users see **only** Home, Audit Logs and Logout —
no other menu entries, and no direct-URL escape. Once complete, the wizard link
disappears permanently.

---

## 1. Analysis — current state

| Piece | State |
|---|---|
| `/master-setup` route | Exists — `App.js`, wrapped in `ApprovedRoute` + `ScopeGuard([TENANT_ADMIN, TENANT_SUPER_ADMIN])`. |
| `MasterDataSetup.js` | 302 lines. Makes exactly **one** API call (`bootstrapMasterData`) — no prefetch, so nothing else needs allowlisting. |
| Navbar link | `STRINGS.nav.masterSetup` ("Setup Wizard") shown to **every** tenant admin, always, in both desktop and mobile menus. |
| Guards | `ProtectedRoute`, `ScopeGuard`, `ApprovedRoute`, `GuestRoute`. No setup awareness. |
| `AuthContext` | User comes solely from `decodeToken(cookie)`. No way to swap in a new token without a full login or tenant switch. |
| `AdminAllUsers.js` | Columns: Email, Tenant, Status, Roles, Flags, Actions. No setup column. |

**Key implication:** the whole gate rides on one new JWT claim, `setupCompleted`.
Because `decodeToken` returns the entire payload, `user.setupCompleted` is
available for free — no new state plumbing.

---

## 2. Shared predicate — `src/utils/permissions.js`

```js
// A tenant is mid-setup only when the token explicitly says so. Tokens minted
// before this feature carry no claim and are treated as complete, matching the
// backend gate. Super admins are exempt.
export const isSetupPending = (user) =>
  !!user?.tid &&
  user.onboardingStatus === 'APPROVED' &&
  user.setupCompleted === false &&
  !hasScope(user, [SCOPES.TENANT_SUPER_ADMIN]);
```

One predicate, used by the guards, the Navbar and the wizard page — no drift
between what's hidden and what's blocked.

---

## 3. Route gating — `src/components/Guards.js` + `App.js`

Extend `ApprovedRoute` with an `allowDuringSetup` prop rather than adding a
fifth guard — it keeps every route's protection expressed in one wrapper.

```jsx
export const ApprovedRoute = ({ children, allowDuringSetup = false }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  if (!user.tid || user.onboardingStatus !== 'APPROVED')
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  if (!allowDuringSetup && isSetupPending(user))
    return <Navigate to={ROUTES.MASTER_SETUP} replace />;

  return children;
};
```

**`allowDuringSetup` goes on exactly three routes** — everything else inherits
the block automatically, including any route added later:

| Route | Flag |
|---|---|
| `ROUTES.DASHBOARD` (Home) | `allowDuringSetup` |
| `ROUTES.AUDIT` (Audit Logs) | `allowDuringSetup` |
| `ROUTES.MASTER_SETUP` (the wizard) | `allowDuringSetup` |
| `/master`, `/reports`, `/admin/*`, `/admin/settings`, `/frontdesk/*` | *(none — blocked)* |

Logout needs no route — it's a Navbar action.

**Catch-all.** The `path="*"` route renders `NotFound` outside any guard, so a
gated user typing a nonsense URL currently escapes the redirect. Wrap it:

```jsx
<Route path="*" element={<ApprovedRoute><NotFound /></ApprovedRoute>} />
```

This closes the "not even direct URL" requirement completely — every path in the
app now either redirects to the wizard or is one of the three allowed screens.

---

## 4. Navbar — `src/components/Navbar.js`

Two independent changes.

**4.1 Hide the wizard link once done.** This is the "never show this option
again" requirement:

```jsx
{hasScope(user, [SCOPES.TENANT_ADMIN, SCOPES.TENANT_SUPER_ADMIN])
  && user.setupCompleted === false && (
  <Link to={ROUTES.MASTER_SETUP}>{STRINGS.nav.masterSetup}</Link>
)}
```

Backfilled existing tenants have no claim → link hidden → correct end state.

**4.2 Collapse the menu while gated.** Introduce a `setupPending` flag alongside
the existing `isGuest`, and render only Home + Audit Logs (subject to its
existing scope check). Apply identically to the desktop `.nav-links` block and
the `.mobile-menu` block — they are currently duplicated, so both must change
together. Hide the hamburger's other entries; keep the profile dropdown and
Logout untouched.

Add a `Setup Required` pill mirroring the existing `.guest-badge` pattern, and
suppress the tenant switcher while gated (switching mid-setup is confusing and
the target tenant may itself be incomplete).

---

## 5. `AuthContext` — accepting the fresh token

The bootstrap response returns `data.setupToken`. Add a small helper so the
wizard can unlock the app without a re-login:

```js
const applyToken = (token) => {
  Cookies.set(APP_CONFIG.COOKIE_NAME, token, {
    expires: APP_CONFIG.COOKIE_EXPIRY_HOURS / 24,
    secure: false,
  });
  setUser(decodeToken(token));
};
```

Expose it on the context value next to `login` / `logout` / `switchTenant`.
Deliberately does *not* hard-navigate the way `switchTenant` does — the wizard
controls its own redirect.

---

## 6. `MasterDataSetup.js`

- **Block re-entry.** On mount, if `user.setupCompleted !== false` → 
  `<Navigate to={ROUTES.DASHBOARD} replace />`. Direct-URL return visits after
  completion land on the dashboard; the backend 409 is the second line of defence.
- **On success:** `applyToken(res.data.data.setupToken)` → success toast →
  `navigate(ROUTES.DASHBOARD)`. The token swap must precede the navigate, or the
  still-gated `ApprovedRoute` bounces the user straight back.
- **Gated banner.** When `isSetupPending(user)`, show a non-dismissible notice
  at the top: this must be completed before the rest of the application unlocks.
  This is the only explanation the user gets for the empty menu.
- **No back door.** Ensure the page has no "skip"/"do later" affordance.

---

## 7. `AdminAllUsers.js` — the tracking column

New **Tenancy Setup** column between *Tenant* and *Status*, fed by the additive
`setup_status` field on `GET /api/admin/users/all`:

```jsx
<td>
  <span className={`badge ${u.setup_status === 'COMPLETED'
    ? 'badge-setup-done' : 'badge-setup-pending'}`}>
    {u.setup_status === 'COMPLETED' ? 'Completed' : 'Incomplete'}
  </span>
</td>
```

- Green `badge-setup-done` / red `badge-setup-pending` in `Admin.css`, following
  the existing `badge-active` / `badge-suspended` colour tokens so it reads as
  part of the same table rather than a bolt-on.
- Add a `title` with `setup_completed_at` when present.
- Extend the header row and, since the table already lives in
  `.table-scroll-wrapper`, confirm the extra column doesn't break the responsive
  layout at mobile widths.
- Note the value is **per tenant**, so all rows of the same tenant show the same
  badge — worth a line in the existing explanatory paragraph above the table.

---

## 8. API interceptor — `src/api/api.js`

On a `403` whose body carries `code === 'TENANT_SETUP_REQUIRED'`, redirect to
`ROUTES.MASTER_SETUP`. Covers the stale-tab case: a session left open from
before the gate landed, or a user gated mid-session. Must not interfere with the
existing 401/403 handling for ordinary scope failures — match on the `code`
field specifically, not the status alone.

---

## 9. Tests

### New
- **`src/components/__tests__/Guards.test.js`**
  - `setupCompleted: false` + a normal route → redirects to `/master-setup`
  - same user + `allowDuringSetup` route → renders
  - super admin with `setupCompleted: false` → renders everything
  - **no `setupCompleted` claim → renders everything** (back-compat)
- **Navbar test** — gated user sees only Home + Audit; wizard link hidden once
  `setupCompleted` is true/absent.

### Extended
- **`src/pages/__tests__/MasterDataSetup.test.js`** (exists) — success path calls
  `applyToken` then navigates; mounting with setup already complete redirects.
- **`src/pages/admin/__tests__/AdminAllUsers.test.js`** (exists) — green badge for
  `COMPLETED`, red for `PENDING` / missing, and existing column assertions still
  pass with the extra `<th>`.

### Regression guarantee
Existing tests build users without a `setupCompleted` field, so `isSetupPending`
returns `false` and every current assertion holds. No existing test should need
modification — same acceptance criterion as the backend gate.

---

## 10. Implementation order

1. `isSetupPending` in `utils/permissions.js`
2. `applyToken` in `AuthContext`
3. `ApprovedRoute` extension + `App.js` flags + catch-all wrap ← *run the suite here; must be green*
4. Navbar (both desktop and mobile blocks)
5. `MasterDataSetup.js` — redirect guard, token swap, banner
6. `AdminAllUsers.js` column + `Admin.css` badges
7. API interceptor
8. Test additions
