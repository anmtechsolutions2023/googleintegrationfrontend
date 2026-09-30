# Payment Methods — Frontend Plan

A Front Desk screen for which tenders an outlet accepts, plus the till changes
that make the setting real.

Backend half: `googleintegrationbackend/PAYMENT_METHODS_PLAN.md`. Read §2.3 there
first — the inherit-on-absence rule is what the UI's "Default / Overridden"
states are showing.

---

## 1. What exists

`Billing.js` already fetches `posService.getPaymentModes()` and renders the modes
as radios with the ledger account under each name. The list is right; four things
about it are not.

| # | Today | Effect at the counter |
|---|---|---|
| 1 | `needsRef = ['card','upi','wallet'].includes(modeName(id).toLowerCase())` (line ~948) | Rename *Card* to *Credit Card* and the reference number stops being required — silently |
| 2 | `paymentModes.map(...)` (line ~2556), no `Active` filter | Deactivating a method does not remove it from the counter |
| 3 | `addTender` takes `paymentModes[0]`, list ordered `CreatedOn DESC` | The default tender is the newest method — usually *District Settlement* |
| 4 | Every tenant tender is shown | Three portal settlement tenders clutter the radios of a counter that can never use them |

Master Data → Payment Modes (`config/modules.js`, `paymentModes`) offers exactly
two fields, `Type` and `Active`. No account, which is the one thing a tender
cannot work without.

## 2. The screen

**Front Desk → Setup → Payment Methods**, `/frontdesk/payment-methods`.

Sits directly under **POS Settings** in `config/navigation.js`: it is a per-branch
operational setting, the same shape as Receipt Format.

```js
{ key: 'fd-payment-methods', path: '/frontdesk/payment-methods',
  label: 'Payment Methods', icon: '💳',
  scopes: [SCOPES.POS_CONFIG_READ, SCOPES.MASTER_DATA_READ, SCOPES.TENANT_ADMIN] },
```

Also: `ROUTES.PAYMENT_METHODS` in `constants/routes.js`, and the lazy route in
`App.js` beside the other Front Desk pages.

`src/pages/frontdesk/PaymentMethods.js` + `paymentMethods.css`, bespoke like its
neighbours (`ReceiptFormat.js`, `BusinessProfile.js`) rather than generic CRUD —
it is a toggle list over a branch, not a table of rows.

### 2.1 Layout

Branch picker at the top, exactly as Receipt Format and Business Profile do it —
this is per-outlet and the screen must say so before anything else.

```
Payment Methods
Which tenders this outlet accepts. Cash and UPI are on for a new outlet.

Outlet:  [ Mayini Kitchen        ▾ ]

┌──────────────────────────────────────────────────────────────┐
│  ON   Cash                             Cash · ASSET          │
│ ◉──                                                           │
│                                                               │
│  ON   UPI                              Bank · ASSET     ⟲    │
│ ◉──                        needs a reference number           │
│                                                               │
│ ──◯   Card                             Bank · ASSET          │
│  OFF                       needs a reference number           │
│                                                               │
│ ──◯   Wallet                           Wallet · ASSET        │
│  OFF                                                          │
├──────────────────────────────────────────────────────────────┤
│  Portal settlement                                            │
│  Used when a Zomato or Swiggy order settles. Not offered at   │
│  the counter.                                                 │
│                                                               │
│ ──◯   Zomato Settlement       Aggregator Receivable · ASSET   │
│ ──◯   Swiggy Settlement       Aggregator Receivable · ASSET   │
│ ──◯   District Settlement     Aggregator Receivable · ASSET   │
└──────────────────────────────────────────────────────────────┘

                                    [ + Add a method ]
```

The account under each name is not decoration — it is what stops someone enabling
*Zomato Settlement* at the counter, which books to a receivable and leaves the
cash session short by the whole sale with nothing on screen to explain it. The
till already shows it for the same reason; keep the styling consistent
(`.fd-mode-acct`).

Group the `* Settlement` tenders under their own heading (match on
`accountKind === 'ASSET' && accountName === 'Aggregator Receivable'`, not on the
name — see hole 1). They stay toggleable: a house account settled by hand is a
real thing. They are simply not what a counter reaches for.

### 2.2 Inherited vs overridden

`source` from the API drives one affordance, nothing more: when a method's state
came from a branch override (`source === 'branch'`), show a small **⟲ Reset**
next to it. Clicking it sends the tenant default back, which the backend stores
by *deleting* the row.

Do not badge the inherited case. Most rows are inherited and most of the time
that is unremarkable — a badge on the common state is noise. The reset control
appearing is a sufficient signal that this row was decided here.

### 2.3 Add / edit a method

"+ Add a method" opens a modal, not a separate page:

- **Name** — text, max 50, required. Placeholder `e.g. Meal Voucher, Cheque, Bank Transfer`
- **Money lands in** — select over `accounttypebase` (`getAccountTypes`), **required**.
  Hint: *Cash goes to Cash. Card, UPI and bank transfers go to Bank.*
- **Needs a reference number** — checkbox. Hint: *The cashier must type a transaction
  or approval number before the sale can be settled.*
- **On for new outlets** — checkbox, default on. Hint: *Outlets that have not been
  configured will offer this.*

This writes the tenant catalogue (`POST /api/paymentmodes`), so the modal must say
it applies to the whole business, not to the selected outlet. One line under the
title: *Methods are shared across outlets. Whether each one is offered is set per
outlet above.*

Editing a method reuses the same modal. Renaming is safe now that the reference
rule is a column rather than a name match.

Deleting: confirm, and say what it does — it removes the method everywhere and
cascades its per-branch settings. A method already used on a settled bill must not
be deletable; surface the backend's FK error as *"This method has been used on a
bill and cannot be removed. Switch it off instead."*

### 2.4 Saving

Toggling saves immediately — one `PUT` per toggle, optimistic, with the switch
reverting and a toast on failure. A Save button on a screen of switches is a
button people forget to press, and the failure mode is an outlet that quietly
takes no card payments.

The backend refuses a save that would leave zero methods enabled. Pre-empt it:
disable the last enabled toggle and title it *"An outlet must accept at least one
payment method."*

## 3. Service layer

`src/services/posService.js`, beside the other per-branch calls:

```js
// The tenders an outlet accepts. Per branch: the catalogue is tenant-wide, the
// on/off is not. Serves both this screen and the till.
export const getBranchPaymentMethods = async (branchId) => {
  const res = await api.get('/api/pos/payment-methods', { params: { branchId } })
  return toObject(res.data)
}
export const setBranchPaymentMethods = async (branchId, methods) => {
  const res = await api.put('/api/pos/payment-methods', { methods }, { params: { branchId } })
  return toObject(res.data)
}
```

Export both in the default object at the bottom.

`getPaymentModes()` stays for the Master Data screen. New code uses the
branch-resolved call.

## 4. The till

`Billing.js`. This is where the feature becomes real, and it is a small diff.

**Fetch** — swap `getPaymentModes()` for `getBranchPaymentMethods(branchId)` in
the bulk load (~line 219), and keep only what the branch offers:

```js
setPaymentModes((resolved?.methods || []).filter((m) => m.enabled && m.active !== false))
```

That one filter closes holes 2 and 4 together: an inactive method is gone, and so
is every tender this outlet does not take — including the portal settlements.

**Reference numbers** (~line 948) — read the column:

```js
const needsRef = (id) => {
  const m = paymentModes.find((p) => (p.paymentModeId || p.id || p.Id) === id)
  return !!(m && (m.requiresReference ?? m.RequiresReference))
}
```

Delete the `['card','upi','wallet']` array. Also soften the two user-facing
strings that name the methods — *"Enter a reference number for card, UPI and
wallet payments"* (~1290, ~2870) becomes *"Enter a reference number for this
payment method."*, since which methods need one is now the tenant's decision.

**Field names** — the resolved payload uses `paymentModeId` / `type`, not
`Id` / `Type`. `modeName` and the radio `map` already tolerate both shapes
(`m.id || m.Id`); extend them to `m.paymentModeId` rather than rewriting. The
tender rows still carry `paymentModeId` into `paymentbreakup` unchanged.

**Default tender** — the backend now orders by an internal `SortOrder` column
(`CreatedOn` could not order these: it is a `DATETIME` and every provisioned mode
shares it to the second), so `paymentModes[0]` is Cash. No change needed here,
but assert it in a test: it is the kind of thing that regresses invisibly.

**Empty state** (~line 2517) — the message currently points at Master Data. Point
it at the new screen instead:

> No payment methods are switched on for this outlet. Turn one on under
> **Front Desk → Payment Methods**, then reopen Settle.

## 5. Master Data → Payment Modes

`config/modules.js`, `paymentModes` (~line 1243). Add the fields the backend now
accepts, so the two screens do not disagree:

```js
{ name: 'DefaultAccountTypeBaseId', label: 'Money lands in', type: 'select',
  reference: 'accountTypes', required: true },
{ name: 'RequiresReference', label: 'Needs a reference number', type: 'boolean', default: false },
{ name: 'EnabledByDefault',  label: 'On for new outlets',      type: 'boolean', default: true },
```

Add `AccountName` to `tableColumns`. A tender whose account is blank is the bug
this closes — the column makes it visible at a glance.

## 6. Tests

`src/pages/frontdesk/__tests__/PaymentMethods.test.js`:

- renders the resolved list, grouped, with the account under each name
- a toggle sends one `PUT` for that method only
- a failed save reverts the switch and toasts
- the last enabled method cannot be switched off
- Reset appears only for `source: 'branch'`
- the add modal refuses a method with no account

`src/pages/frontdesk/__tests__/Billing.*` — extend:

- a disabled method is absent from the settle radios
- an `active: false` method is absent
- `requiresReference` drives the reference warning, and a method named `Card`
  with `requiresReference: false` does **not** demand one (the regression that
  motivated the column)
- the first tender defaults to Cash

## 7. Order of work

Backend §1–7 must land first — the screen is a client of `GET /api/pos/payment-methods`.

1. `posService` — the two calls
2. `PaymentMethods.js` + css, read-only first (render the resolved list)
3. Toggles + optimistic save
4. Add / edit / delete modal
5. Nav, route, `ROUTES` constant
6. `Billing.js` — the four fixes in §4
7. `modules.js` field additions
8. Tests

Step 6 is the one with counter impact. It is also the smallest: a filter, a
predicate and two strings.
