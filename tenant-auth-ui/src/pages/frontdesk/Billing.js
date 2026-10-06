import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import Receipt from '../../components/frontdesk/receipt/Receipt'
import usePrintReceipt from '../../components/frontdesk/receipt/usePrintReceipt'
import PrinterButton from '../../components/frontdesk/PrinterButton'
import { buildKotPrintData } from '../../utils/kotPrint'
import useMenuFilters from '../../hooks/useMenuFilters'
import MenuFilterBar, { CategoryChips, DietChips } from '../../components/frontdesk/MenuFilterBar'
import TableServiceEditor from '../../components/frontdesk/TableServiceEditor'
import LineOptions, { NoteIcon } from '../../components/frontdesk/LineOptions'
import KitchenNoteEditor from '../../components/frontdesk/KitchenNoteEditor'
import {
  parsePresets, NOTE_PRESETS_KEY, ORDER_NOTE_MAX, DEFAULT_NOTE_PRESETS,
} from '../../utils/lineOptions'
import {
  effectiveTags, isAvailable, isOnSale, openLabel, categoryNameOf,
  remainingOf, isSoldOut, isUnsetToday,
} from '../../utils/menuFilters'
import { APP_CONFIG, SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import RoundsTimeline from '../../components/frontdesk/RoundsTimeline'
import BillSummary from '../../components/frontdesk/BillSummary'
import TransferSheet from '../../components/frontdesk/TransferSheet'
import TableBoard from '../../components/frontdesk/TableBoard'
import TableStartPanel from '../../components/frontdesk/TableStartPanel'
import { tableInfo, suggestTable } from '../../utils/tableSessions'
import { QR_ORDER_READ_SCOPES } from '../../components/frontdesk/QrOrderAlert'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import CustomerPicker from '../../components/frontdesk/CustomerPicker'
import CollectFlow from '../../components/frontdesk/CollectFlow'
import {
  buildTableRounds, buildRoundIndex, formatRoundTime, itemLabel,
} from '../../utils/posRounds'
import { summarizeSession, estimateAfterDiscount, roundPayable } from '../../utils/posBilling'

const { MAX_LIMIT } = APP_CONFIG.PAGINATION

// Normalize item-meta price. Prefer the linked CostInfo amount (new normalized
// model); fall back to the legacy Prices JSON for older records.
const itemPrice = (meta) => {
  if (!meta) return 0
  if (meta.CostInfoAmount !== undefined && meta.CostInfoAmount !== null) return Number(meta.CostInfoAmount) || 0
  const prices = meta.Prices
  if (Array.isArray(prices) && prices.length > 0) return Number(prices[0].price || prices[0].Price || 0)
  if (typeof prices === 'object' && prices !== null) return Number(prices.price || prices.Price || 0)
  return 0
}

// Falls back to a placeholder rather than the raw ItemDetailId: a uuid on a cart
// line, a printed bill and a kitchen ticket is worse than an honest "Unnamed
// item", and it used to travel all the way to the cook.
const itemName = (meta, detail) => {
  // The menu payload now carries the catalogue name — positemmeta joins
  // itemdetail — so the common path resolves without a second request.
  // `detail` remains the fallback for a row the join could not name.
  if (meta?.ItemName) return meta.ItemName
  if (detail) return detail.Name || detail.name || 'Unnamed item'
  return 'Unnamed item'
}

// Effective tax rate for a menu row, straight off the server-resolved chain
// (costinfo → taxgroup → mapper → TaxTypes). Display only — the authoritative
// amounts come from POST /api/pricing/quote, which owns the rounding rules.
//
// Replaces a local taxPct() that read the legacy Prices JSON. That column is no
// longer written by the Menu Items form, so it always returned 0 and every POS
// bill was raised with zero tax.
const itemTaxRate = (meta) => Number(meta?.TaxBreakdown?.effectiveRate) || 0

const money = (n) => (Number(n) || 0).toFixed(2)

// ── What the counter may be paid with ───────────────────────────────────────
// Both helpers emit ONE shape — the catalogue's — so everything downstream
// (the radios, modeName, the tender rows that become paymentbreakup) keeps
// reading the same keys whichever source the list came from.
//
// A tender carries the ACCOUNT it lands in, and that is not decoration: a
// counter sale settled to 'Zomato Settlement' books to Aggregator Receivable —
// money owed for weeks — and leaves the cash session short by the whole sale
// with nothing on screen to explain it.
const asOfferedMode = (m) => ({
  Id: m.paymentModeId,
  Type: m.type,
  AccountName: m.accountName,
  AccountKind: m.accountKind,
  // The reference-number rule, as a property of the METHOD. It used to be a
  // hardcoded match on the name, so renaming 'Card' silently dropped it.
  RequiresReference: !!m.requiresReference,
})

/** The outlet's resolved list — what THIS counter accepts. */
const offeredModes = (methods) => (methods || [])
  .filter((m) => m.enabled && m.active)
  .map(asOfferedMode)

/**
 * The tenant catalogue reduced to what an unconfigured outlet inherits.
 *
 * Used only before a branch is known (an empty cart). Without the filter the
 * counter would offer every tender the business has ever defined, portal
 * settlements included.
 */
const defaultOfferedModes = (rows) => (rows || [])
  .filter((m) => (m.EnabledByDefault ?? m.enabledByDefault ?? 1) && (m.Active ?? m.active ?? 1))
  .map((m) => ({
    Id: m.Id ?? m.id,
    Type: m.Type ?? m.type,
    AccountName: m.AccountName ?? m.accountName,
    AccountKind: m.AccountKind ?? m.accountKind,
    RequiresReference: !!(m.RequiresReference ?? m.requiresReference),
  }))


const Billing = () => {
  // The till is offered on POS_ORDER:READ, but what it lets you DO splits in
  // two: punching an order is order work, taking the money is billing work. A
  // waiter has the first and not the second, so offering Settle to everyone who
  // could open this screen sent them into a 403 at the end of a sale.
  const canTakeOrders = useCan(SCOPES.POS_ORDER_WRITE)
  const canTakeMoney  = useCan(SCOPES.POS_BILLING_WRITE)
  const [tables, setTables]     = useState([])
  const [floors, setFloors]     = useState([])
  const [menu, setMenu]         = useState([])
  const [variants, setVariants] = useState([])
  // Add-on masters, loaded once and joined locally. Two lists rather than one
  // nested read because a group's options are needed on every card open and
  // re-fetching them per dish would put a network round trip in the middle of
  // taking an order.
  const [addonGroups, setAddonGroups] = useState([])
  const [addons, setAddons] = useState([])
  const [itemDetails, setItemDetails] = useState({})

  // ONE sheet for both kinds of choice — see the "Add-ons in the order" canvas.
  // A dish can offer variants, add-on groups, or both, and opening a second
  // modal after the first would mean two dialogs in a row for one dish.
  //
  // Variants stay optional (Skip still adds the plain item); an add-on group
  // with MinSelection > 0 does not, because the kitchen cannot cook "pizza,
  // crust unspecified".
  const [customise, setCustomise] = useState(null) // { meta, variantIds: [], addonIds: [], note: '' }
  const [loading, setLoading]   = useState(true)

  // active order state
  const [selectedTable, setSelectedTable] = useState('')
  // Counter service: takeaway ordered at the till, with no table. The customer
  // pays first and leaves with a token, so the session is a single order rather
  // than a table someone keeps adding rounds to.
  const [counterMode, setCounterMode] = useState(false)
  const [counterOrderId, setCounterOrderId] = useState(null)
  const [counterBusy, setCounterBusy] = useState(false)
  // Who this order is for. pos_order.CustomerId and the whole settle → ledger
  // contact chain have always existed; nothing ever set them, so every sale was
  // a walk-in and the CRM counters stayed at zero. Optional: leaving it empty
  // is a walk-in and behaves exactly as before.
  const [customer, setCustomer] = useState(null)
  const [cartItems, setCartItems] = useState([])
  const [activeOrders, setActiveOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  // True while the selected table's live rounds are being fetched.
  const [sessionLoading, setSessionLoading] = useState(false)

  // settle bill modal
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleDiscount, setSettleDiscount] = useState(0)
  // How the discount value is interpreted: a flat ₹ amount or a % of the subtotal.
  const [settleDiscountType, setSettleDiscountType] = useState('amount')
  // Whether the cashier is discounting the bill as a whole or individual dishes.
  // Both can apply at once — the toggle only decides which controls are shown.
  const [discountMode, setDiscountMode] = useState('bill')
  // Per-item discount DRAFTS, keyed "<orderId>#<lineIndex>" → { type, value },
  // where value is the raw input string and may be empty.
  //
  // Empty drafts are kept rather than dropped: ₹/% is chosen BEFORE the number
  // is typed, and deleting the entry the moment the value was blank reset the
  // choice straight back to ₹ — the toggle looked dead. `activeLineDiscounts`
  // is what leaves this component, so a blank draft still prices nothing.
  const [lineDiscounts, setLineDiscounts] = useState({})
  // Tender rows. Each becomes one paymentbreakup in the ledger, so the UI
  // mirrors the data model exactly — no translation layer to get wrong.
  // TWO SOURCES, ONE DERIVED ANSWER — deliberately not one piece of state both
  // writers set. The till reloads its data whenever an order is placed, so a
  // shared `paymentModes` meant the bulk load raced the branch read and the
  // counter silently reverted to the tenant-wide list mid-shift.
  const [paymentCatalogue, setPaymentCatalogue] = useState([])
  const [branchMethods, setBranchMethods] = useState(null)
  const [tenders, setTenders] = useState([])
  const [settledInvoice, setSettledInvoice] = useState(null)
  // Who owes the rest when a bill is paid short. A balance with no name on it
  // is one nobody can chase, so the ledger refuses a partial settle without
  // one — unless a guest is already on the table.
  const [debtorName, setDebtorName] = useState('')
  const [debtorMobile, setDebtorMobile] = useState('')
  // The invoice the Collect sheet is open on, from the confirmation screen.
  const [collectNow, setCollectNow] = useState(null)
  // The moment the customer is standing at the counter with their money out.
  // Until now this screen minted an invoice number and offered only "Done".
  const [printBranchId, setPrintBranchId] = useState(null)
  // The tenancy's branch, when it has exactly one. A single-outlet tenancy
  // seldom sets a branch on its tables or dishes, so nothing on the till names
  // one — and with no branch no receipt format loads, which printed bills with
  // no shop name or GSTIN (and, before the receipt guarded it, crashed).
  const [soleBranchId, setSoleBranchId] = useState(null)
  // The menu's search, category, diet and tag filters live in useMenuFilters
  // below — the same hook Menu Master uses.
  const [printing, setPrinting] = useState(false)
  // ── Campaign offers ────────────────────────────────────────────────────
  // A PREVIEW. The settle path re-runs the same rules server-side and writes
  // the discounts itself, so a cashier who never opens this still gets the
  // right bill — this is so they can see what is about to happen.
  const [offerCheck, setOfferCheck] = useState(null)
  const [checkingOffers, setCheckingOffers] = useState(false)
  // Re-evaluated as the cart changes, so a free line is struck through BEFORE
  // anybody presses Settle. Still only a preview — the server re-runs the same
  // rules inside the settle transaction and writes the discounts itself.
  const [cartOffers, setCartOffers] = useState(null)
  // The same evaluation again, against the COMMITTED rounds rather than the
  // cart. Needed because the cart is empty by the time anybody settles — on the
  // counter path it is emptied by the very tap that opens the settle modal — so
  // `cartOffers` above cannot answer "what is this bill actually going to cost".
  const [settleOffers, setSettleOffers] = useState(null)
  // Whether sending a round also puts it on paper. Read per branch and held, so
  // pressing Send never waits on a settings call — and a failed read leaves it
  // ON, because a kitchen that expected a ticket and got none is the worse of
  // the two failures.
  const [kotAutoPrint, setKotAutoPrint] = useState(true)
  // Kitchen notes. The quick picks are the branch's own (POS Settings); the
  // whole-order note and the cutlery flag belong to the cart being built, and
  // go with it when the round is placed.
  const [notePresets, setNotePresets] = useState(DEFAULT_NOTE_PRESETS)
  const [orderNote, setOrderNote] = useState('')
  const [noCutlery, setNoCutlery] = useState(false)
  // The cart line whose note is open for editing, or null.
  const [noteLine, setNoteLine] = useState(null)
  // The tenancy's only branch stands in ONLY while nothing on the till names
  // one: it never becomes the held print branch, so a real one always wins.
  const { job, format, shop, taxMode, print, failed: printFailed, failedReason: printFailedReason, clearFailed } = usePrintReceipt(printBranchId || soleBranchId)
  const [settling, setSettling] = useState(false)
  // Live discounted preview from the server (discount applied BEFORE tax), so the
  // payable the cashier sees matches the bill that will be raised.
  const [settleQuote, setSettleQuote] = useState(null)

  // table transfer
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)

  // delete a whole round (order) — allowed while the kitchen hasn't started it
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingRound, setDeletingRound] = useState(false)
  const [kots, setKots] = useState([])

  // Guests and waiter. Before a table's first round they are only a draft —
  // there is no order yet to write them to — and they ride on that round when
  // it is saved. After it, the rounds themselves are the record.
  const [waiters, setWaiters] = useState([])
  const [serviceDraft, setServiceDraft] = useState({ guests: null, waiterId: null })
  const [serviceEditOpen, setServiceEditOpen] = useState(false)
  const [serviceSaving, setServiceSaving] = useState(false)
  // The tender the cashier expects, picked in the order panel before Settle so
  // the payment sheet opens on it. Null is "the outlet's first method".
  const [payModeId, setPayModeId] = useState(null)
  const [billPrinting, setBillPrinting] = useState(false)
  const searchRef = useRef(null)
  const cartRef = useRef(null)
  const billingRef = useRef(null)
  const boardFindRef = useRef(null)
  // The table board under the search: open while no table is chosen (step 1),
  // folded to one row once one is (step 2) unless the cashier opens it again.
  const [boardOpen, setBoardOpen] = useState(false)
  // Open, the board fills the middle column and the dishes wait behind it —
  // with 40 tables on six floors there is no room for both. Picking a
  // category, searching, or "Add dishes first" brings the dishes up before a
  // table is chosen; they then wait in the order panel for one.
  const [dishesFirst, setDishesFirst] = useState(false)
  // The walk-in party size typed in the empty order panel. It picks the table
  // the board suggests, and becomes the order's guests when they are seated.
  const [walkInGuests, setWalkInGuests] = useState(2)
  // Tables with a guest's QR order waiting for review, for the tag on the
  // strip. Read on the same scopes as the QR inbox and refreshed on the same
  // beat as the floor's QR banner.
  const { user } = useAuth()
  const canSeeQr = hasScope(user, QR_ORDER_READ_SCOPES)
  const [qrTableIds, setQrTableIds] = useState(() => new Set())
  // On a phone the order panel is a sheet over the menu; this is whether it is up.
  const [sheetOpen, setSheetOpen] = useState(false)
  // Bumped by F4 so the board's finder takes focus once the board is drawn.
  const [findFocusTick, setFindFocusTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Every list needs MAX_LIMIT explicitly: the API's default page size is 10,
      // so omitting it silently capped the menu at 10 dishes and the floor plan
      // at 10 tables — the item you wanted simply was not on the grid.
      //
      // allSettled, not all: one refused list must not discard the six that
      // came back. Variants and payment modes are gated on scopes a given role
      // may not hold, and losing the whole till because the tender list was
      // refused is a worse answer than a till without that one dropdown.
      const [t, f, m, orders, v, k, modes, ag, ao, w] = (await Promise.allSettled([
        posService.getTables({ limit: MAX_LIMIT }),
        posService.getFloors({ limit: MAX_LIMIT }),
        posService.getItemMeta({ limit: MAX_LIMIT }),
        posService.getOrders({ limit: MAX_LIMIT }),
        posService.getVariants(),
        posService.getKots({ limit: MAX_LIMIT }),
        posService.getPaymentModes(),
        posService.getAddonGroups(),
        posService.getAddons(),
        // Inside a promise so a backend without this route — or a call that
        // throws before it returns one — costs the waiter picker, not the till.
        Promise.resolve().then(() => posService.getWaiters()),
      ])).map((r) => (r.status === 'fulfilled' ? r.value : null))

      // The menu is what the screen is FOR, so its absence is reported rather
      // than rendered as an empty grid the cashier will stare at.
      if (m === null) toast.error('The menu could not be loaded')

      setTables(t || [])
      setFloors(f || [])
      setMenu(m || [])
      setVariants(v || [])
      setAddonGroups(ag || [])
      setAddons(ao || [])
      setWaiters(Array.isArray(w) ? w : [])
      // The tenant-wide catalogue. Only ever used before a branch is known; see
      // the derivation below.
      setPaymentCatalogue(modes || [])
      setKots(Array.isArray(k) ? k : [])
      const open = (orders || []).filter((o) => (o.Status || '').toLowerCase() !== 'closed')
      setActiveOrders(open)

      // Names arrive WITH the menu now, so the common path fetches nothing here.
      //
      // This used to resolve every name with its own GET /api/itemdetails/:id:
      // 51 extra requests on a 51-dish menu, on EVERY load, each taking one of
      // the four pool connections. That storm is what a settle then queued
      // behind — the reason a settlement could sit for seconds and then fail.
      //
      // The per-id fetch survives only for rows the join could not name, which
      // is normally none. A missing name is still not cosmetic: it travels onto
      // the order line, into the KOT snapshot and onto the kitchen display, so
      // the unresolved count is surfaced rather than a raw uuid reaching a cook.
      const ids = [...new Set(
        (m || []).filter((x) => !x.ItemName).map((x) => x.ItemDetailId).filter(Boolean),
      )]
      if (ids.length > 0) {
        const details = {}
        let unresolved = 0
        await Promise.allSettled(ids.map(async (id) => {
          try {
            const d = await posService.getItemDetail(id)
            if (d) details[id] = d
            else unresolved += 1
          } catch { unresolved += 1 }
        }))
        setItemDetails(details)
        if (unresolved > 0) {
          toast.warn(`${unresolved} menu item name(s) could not be loaded`)
        }
      }
    } catch {
      toast.error('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // A print that quietly does nothing is indistinguishable from a printer that
  // is switched off, and the cashier reprints instead of investigating. Say it.
  useEffect(() => {
    if (!printFailed) return
    toast.error(printFailedReason || 'The receipt did not render, so nothing was sent to the printer. Try again.')
    clearFailed()
  }, [printFailed, printFailedReason, clearFailed])


  // One name resolver for the filter, the chips and the cards, so a dish is
  // never findable by a name the grid does not show.
  const nameOf = useCallback(
    (m) => itemName(m, itemDetails[m.ItemDetailId]),
    [itemDetails],
  )

  // Search, category, diet and tags: one hook, shared with Menu Master, so a
  // manager narrows the menu exactly the way a cashier does.
  const menuFilters = useMenuFilters(menu, nameOf)
  const filteredMenu = menuFilters.filtered
  const menuFiltered = menuFilters.isFiltered
  // The side rail exists when it has something to hold: more than one
  // category, or more than one food type.
  const showRail = menuFilters.catChips.length > 2 || menuFilters.dtChips.length > 2

  // The till's clock, ticking. Half a minute is enough for a label that only
  // has to explain a greyed card; a per-second timer would re-render the whole
  // grid sixty times a minute for a digit nobody is watching.
  const [tillNow, setTillNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTillNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])
  const clockLabel = tillNow.toTimeString().slice(0, 5)

  useEffect(() => {
    if (!canSeeQr) return undefined
    let alive = true
    const read = () => Promise.resolve()
      .then(() => posService.getPendingQrOrders())
      .then((list) => {
        if (!alive) return
        const ids = (Array.isArray(list) ? list : []).map((o) => o.tableId || o.TableId).filter(Boolean)
        setQrTableIds((prev) => {
          // Same tables as before: keep the same Set, so the strip does not redraw.
          if (prev.size === ids.length && ids.every((id) => prev.has(id))) return prev
          return new Set(ids)
        })
      })
      // A missing tag is not worth an error on a till; the QR banner still shows.
      .catch(() => {})
    read()
    const t = setInterval(read, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [canSeeQr])

  // What every table is doing, for the board and the empty order panel — one
  // reading, so the tiles, the counts and "needs attention" always agree.
  const boardInfo = useMemo(
    () => tableInfo(tables, activeOrders, tillNow, qrTableIds),
    [tables, activeOrders, tillNow, qrTableIds],
  )
  const walkInSuggestion = useMemo(
    () => suggestTable(boardInfo, walkInGuests),
    [boardInfo, walkInGuests],
  )

  // Variants offered by a menu row, resolved against the master for name+price.
  // A dish can price a variant its own way (Large +60 on biryani, +40 on
  // lassi); VariantPrices carries those, and the server charges the same.
  const variantsFor = (meta) => {
    const ids = Array.isArray(meta?.VariantIds) ? meta.VariantIds : []
    if (ids.length === 0) return []
    const own = meta?.VariantPrices || {}
    return ids
      .map((id) => {
        const v = variants.find((x) => (x.id || x.Id) === id)
        if (!v) return null
        return own[id] === undefined || own[id] === null ? v : { ...v, Price: Number(own[id]), price: Number(own[id]) }
      })
      .filter(Boolean)
  }

  // Add-on groups offered by a menu row, each with its options already attached.
  //
  // Order matters and is the master's, not the dish's: a cashier working the
  // same three dishes all evening must find the same control in the same place,
  // so groups sort by SortOrder and options within a group do too. A group that
  // has lost all its active options is dropped — a heading with nothing under
  // it reads as a loading bug, not as "nothing to choose".
  const addonGroupsFor = (meta) => {
    const ids = Array.isArray(meta?.AddonGroupIds) ? meta.AddonGroupIds : []
    if (ids.length === 0) return []
    return ids
      .map((id) => addonGroups.find((g) => (g.id || g.Id) === id))
      .filter(Boolean)
      .map((g) => {
        const gid = g.id || g.Id
        return {
          id: gid,
          name: g.Name || g.name,
          minSelection: Number(g.MinSelection ?? g.minSelection) || 0,
          maxSelection: Number(g.MaxSelection ?? g.maxSelection) || 0,
          sortOrder: Number(g.SortOrder ?? g.sortOrder) || 0,
          options: addons
            .filter((a) => (a.AddonGroupId || a.addonGroupId) === gid)
            .map((a) => ({
              id: a.id || a.Id,
              name: a.Name || a.name,
              price: Number(a.Price ?? a.price) || 0,
              sortOrder: Number(a.SortOrder ?? a.sortOrder) || 0,
            }))
            .sort((x, y) => x.sortOrder - y.sortOrder),
        }
      })
      .filter((g) => g.options.length > 0)
      .sort((x, y) => x.sortOrder - y.sortOrder)
  }

  // Add-on ids resolved to name + price, for the cart and the order payload.
  const addonsByIds = (ids) => {
    const wanted = new Set(ids || [])
    if (wanted.size === 0) return []
    return addons
      .filter((a) => wanted.has(a.id || a.Id))
      .map((a) => ({
        id: a.id || a.Id,
        name: a.Name || a.name,
        price: Number(a.Price ?? a.price) || 0,
        groupId: a.AddonGroupId || a.addonGroupId || null,
      }))
  }

  // Which required group, if any, is still unanswered — and which is over its
  // cap. The FIRST unmet rule is what the Add button names, so the cashier is
  // told what to do rather than left to hunt for a red outline.
  //
  // Mirrors posorder.assertAddonSelectionsAreValid on the server. That one is
  // the enforcement; this is the courtesy of saying so before the round is sent.
  const customiseBlocker = (meta, pickedAddonIds) => {
    const picked = new Set(pickedAddonIds || [])
    for (const g of addonGroupsFor(meta)) {
      const count = g.options.filter((o) => picked.has(o.id)).length
      if (count < g.minSelection) return `Choose ${g.name.toLowerCase()} first`
      if (g.maxSelection > 0 && count > g.maxSelection) {
        return `Choose at most ${g.maxSelection} from ${g.name}`
      }
    }
    return null
  }

  // Dine-in with no table chosen yet. The menu is NOT locked: dishes can go in
  // first and wait in the cart, and the order panel asks which table they are
  // for. Nothing can be saved or sent until one is picked — Save needs a table.
  const pickingTable = !selectedTable && !counterMode

  // "Dishes first" belongs to one search for a table: once a table is chosen,
  // or the till switches to takeaway, the next walk-in starts at the board.
  useEffect(() => {
    if (!pickingTable) setDishesFirst(false)
  }, [pickingTable])
  // Asking for a dish — a category, a diet, a search — while the board covers
  // the dishes brings them back: before a table is chosen (they wait in the
  // order panel for one), or beside the table being served.
  const showDishes = () => {
    if (pickingTable) setDishesFirst(true)
    setBoardOpen(false)
  }

  // The selected table, for the order panel and the print-outs. Falls back to a
  // neutral name if the table has since been retired from the floor plan.
  const selectedTableRow = tables.find((t) => (t.id || t.Id) === selectedTable) || null
  const selectedTableName = selectedTableRow
    ? (selectedTableRow.Name || selectedTableRow.name)
    : 'Table'

  // Clicking a menu card adds it straight away unless it offers something to
  // choose, in which case the sheet opens first. A dish with neither variants
  // nor groups must never cost the cashier an extra tap.
  const handleMenuClick = (meta) => {
    const hasVariants = variantsFor(meta).length > 0
    const hasGroups = addonGroupsFor(meta).length > 0
    if (!hasVariants && !hasGroups) { addToCart(meta, [], []); return }
    setCustomise({ meta, variantIds: [], addonIds: [], note: '' })
  }

  const addToCart = (meta, selectedVariants = [], selectedAddons = [], note = '') => {
    const metaId = meta.id || meta.Id
    // The same dish with different options is a different line, so the cart key
    // is the item PLUS its (order-independent) variant AND add-on selection.
    // Sorted so "cheese then olives" and "olives then cheese" are one line.
    const variantIds = selectedVariants.map((v) => v.id || v.Id).sort()
    const addonIds = selectedAddons.map((a) => a.id || a.Id).sort()
    const baseKey = [metaId, ...variantIds, ...addonIds].join('|')
    const kitchenNote = String(note || '').trim()
    // The group is what prints beside an add-on ("Extra dip · Raita"). The
    // server's priced line carries it too; this is for the cart before then.
    const groupNameOf = (groupId) => {
      const group = addonGroups.find((g) => (g.id || g.Id) === groupId)
      return group ? (group.Name || group.name || null) : null
    }

    setCartItems((prev) => {
      // One plate "less spicy" and one "extra spicy" are two instructions, so
      // the same dish with a different note is its own line. Same dish, same
      // options, same note: one more of that line.
      const existing = prev.find(
        (c) => (c.baseKey || c.lineKey) === baseKey && (c.note || '') === kitchenNote,
      )
      if (existing) {
        return prev.map((c) => (c === existing ? { ...c, qty: c.qty + 1 } : c))
      }
      // The key stays unique — the quote, offers and hand-typed discounts are
      // all matched on it. The suffix is short, and the server's cap on the
      // key reserves room for it.
      const taken = new Set(prev.map((c) => c.lineKey))
      let lineKey = baseKey
      for (let n = 2; taken.has(lineKey); n += 1) lineKey = `${baseKey}|n${n}`
      const variantAmount = selectedVariants
        .reduce((s, v) => s + (Number(v.Price ?? v.price) || 0), 0)
      const addonAmount = selectedAddons
        .reduce((s, a) => s + (Number(a.Price ?? a.price) || 0), 0)
      const addOn = variantAmount + addonAmount
      return [...prev, {
        lineKey,
        baseKey,
        note: kitchenNote,
        id: metaId,
        // What an OFFER triggers on. The cart is keyed by the menu entry, but a
        // campaign names the catalogue item and its category — carrying both
        // here is what lets the till evaluate offers without a second lookup.
        itemId: meta.ItemDetailId || null,
        // From the menu row first: the join supplies it, and itemDetails is
        // empty whenever every name resolved — which would have left every
        // category-triggered campaign seeing a null category.
        categoryId: meta.CategoryId || itemDetails[meta.ItemDetailId]?.CategoryId || null,
        name: itemName(meta, itemDetails[meta.ItemDetailId]),
        // Display only — the server recomputes from the masters.
        price: itemPrice(meta) + addOn,
        basePrice: itemPrice(meta),
        variantAmount,
        addonAmount,
        variants: selectedVariants.map((v) => ({
          id: v.id || v.Id,
          name: v.Name || v.name,
          price: Number(v.Price ?? v.price) || 0,
        })),
        variantIds,
        addons: selectedAddons.map((a) => ({
          id: a.id || a.Id,
          name: a.Name || a.name,
          price: Number(a.Price ?? a.price) || 0,
          groupId: a.groupId || a.AddonGroupId || null,
          groupName: a.groupName || a.GroupName || groupNameOf(a.groupId || a.AddonGroupId) || null,
        })),
        addonIds,
        taxPct: itemTaxRate(meta),
        isTaxIncluded: !!meta?.TaxBreakdown?.isTaxIncluded,
        costInfoId: meta.CostInfoId || null,
        qty: 1,
        meta,
      }]
    })
  }

  // A cart line's kitchen note, edited in place. The key does not change, so a
  // discount or an offer already matched to this line stays matched.
  const setLineNote = (lineKey, note) => {
    setCartItems((prev) => prev.map((c) => (
      c.lineKey === lineKey ? { ...c, note: String(note || '').trim() } : c
    )))
  }

  // The notes belong to the cart, so they leave with it.
  const resetKitchenNotes = () => {
    setOrderNote('')
    setNoCutlery(false)
    setNoteLine(null)
  }

  const changeQty = (lineKey, delta) => {
    setCartItems((prev) => {
      const updated = prev.map((c) =>
        c.lineKey === lineKey ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      return updated.filter((c) => c.qty > 0)
    })
  }

  // ── Cart totals come from the server ──────────────────────────────────────
  // Tax is NOT summed locally. Inclusive-vs-exclusive pricing, per-line
  // rounding and the CGST/SGST split all live in one place on the backend; a
  // second implementation here would drift by a paisa and disagree with the bill.
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteFailed, setQuoteFailed] = useState(false)

  const subTotal = cartItems.reduce((s, c) => s + c.price * c.qty, 0)

  // Quantity in the cart per menu entry, for the badge on its tile.
  const cartQtyByMeta = useMemo(() => {
    const out = {}
    cartItems.forEach((c) => { out[c.id] = (out[c.id] || 0) + c.qty })
    return out
  }, [cartItems])

  // ── Offers, live ──────────────────────────────────────────────────────────
  // Debounced: a cashier adding a round taps + six times, and six round trips
  // to price the same cart is six chances to show a stale answer.
  useEffect(() => {
    if (cartItems.length === 0) { setCartOffers(null); return undefined }

    let cancelled = false
    const timer = setTimeout(() => {
      // Offers are a bonus on top of a working till: nothing here may stop
      // somebody taking an order. The try/catch is not belt-and-braces around
      // the promise — it catches a SYNCHRONOUS throw, which a rejected promise
      // handler never sees and which would surface as an uncaught error inside
      // this timer.
      try {
        const branchId = cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId || null
        Promise.resolve(posService.previewOffers(
          cartItems.map((c) => ({
            ref: c.lineKey,
            itemId: c.itemId || null,
            categoryId: c.categoryId || null,
            name: c.name,
            unitAmount: Number(c.price) || 0,
            quantity: Number(c.qty) || 0,
            hasManualDiscount: !!lineDiscounts[c.lineKey],
          })),
          branchId,
          customer?.Id || null,
        ))
          .then((res) => { if (!cancelled) setCartOffers(res) })
          .catch(() => { if (!cancelled) setCartOffers(null) })
      } catch {
        if (!cancelled) setCartOffers(null)
      }
    }, 350)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [cartItems, lineDiscounts, customer])

  // What each line is losing to an offer, keyed the way the cart is.
  const offerByLine = useMemo(() => {
    const out = {}
    ;(cartOffers?.applied || []).forEach((a) => (a.awards || []).forEach((w) => {
      out[w.ref] = {
        offerName: a.name,
        campaignName: a.campaignName,
        percent: w.percent,
        amount: w.discountAmount,
      }
    }))
    return out
  }, [cartOffers])

  // What the cart is priced with: the cashier's own line discounts, plus the
  // campaign ones on every line they did not touch. Mirrors
  // offerEngine.mergeLineDiscounts — manual wins.
  const effectiveCartDiscounts = useMemo(() => {
    const merged = { ...(cartOffers?.lineDiscounts || {}) }
    Object.entries(lineDiscounts || {}).forEach(([ref, d]) => { merged[ref] = d })
    return merged
  }, [cartOffers, lineDiscounts])

  useEffect(() => {
    const lines = cartItems
      .filter((c) => c.costInfoId)
      .map((c) => ({
        costInfoId: c.costInfoId,
        // The menu row, so a variant this dish prices its own way is quoted
        // at that price — the same price the saved order is charged.
        itemMetaId: c.id || undefined,
        quantity: c.qty,
        // The server prices variants and add-ons from their masters; we only
        // name them. Sending prices instead would let a tampered tab decide
        // what extra cheese costs.
        variantIds: c.variantIds || [],
        addonIds: c.addonIds || [],
        ref: c.lineKey,
        // Priced WITH the discount, so Tax and Total are the discounted ones.
        // Without this the cart named the offer on its own row and then totalled
        // as though it had not applied: ₹30 subtotal, "−₹15", and ₹30 to pay.
        //
        // Safe for buildOrderItems below: posorder.priceItems re-prices every
        // line from costInfoId on create and overwrites net/tax/gross, so a
        // discounted figure never reaches the stored round. The order records
        // what was ordered; the discount is the bill's decision.
        discount: effectiveCartDiscounts[c.lineKey] || null,
      }))

    if (lines.length === 0) { setQuote(null); setQuoteFailed(false); return }

    let cancelled = false
    setQuoting(true)
    posService
      .quotePricing(lines)
      .then((res) => { if (!cancelled) { setQuote(res); setQuoteFailed(false) } })
      // A failed quote must not block order taking — fall back to showing the
      // untaxed subtotal rather than wedging the till. It IS flagged though:
      // the order the server saves still carries correct tax, so a silent
      // fallback showed the cashier one total and charged another.
      .catch(() => { if (!cancelled) { setQuote(null); setQuoteFailed(true) } })
      .finally(() => { if (!cancelled) setQuoting(false) })

    return () => { cancelled = true }
  }, [cartItems, effectiveCartDiscounts])

  const taxAmount  = quote ? Number(quote.totals.taxAmount) : 0
  const grandTotal = quote ? Number(quote.totals.grossAmount) : subTotal
  const taxByComponent = quote?.totals?.taxByComponent || []
  // GST switched off for this tenant. The cart then shows one Total — no
  // Subtotal, no CGST/SGST, no Tax row. Explicitly false only: a quote from
  // before the switch existed carries no flag and keeps today's rows.
  const gstOff = quote?.totals?.taxCharged === false

  // Items carry the priced snapshot so the order records what was charged.
  const buildOrderItems = () => {
    const byRef = new Map((quote?.lines || []).map((l) => [l.ref, l]))
    return cartItems.map((c) => {
      const priced = byRef.get(c.lineKey)
      return {
        id: c.id,
        name: c.name,
        price: priced ? priced.unitAmount : c.price,
        basePrice: priced ? priced.baseAmount : c.basePrice,
        variantAmount: priced ? priced.variantAmount : c.variantAmount,
        addonAmount: priced ? priced.addonAmount : c.addonAmount,
        // Sent so the server can re-resolve; the resolved objects come back on
        // the priced line and are what a reprint/repeat order reads.
        variantIds: c.variantIds || [],
        variants: priced ? priced.variants : c.variants,
        addonIds: c.addonIds || [],
        addons: priced ? priced.addons : c.addons,
        qty: c.qty,
        // What the kitchen is told about this plate. Omitted, not blank, when
        // there is none.
        note: c.note || undefined,
        taxPct: c.taxPct,
        isTaxIncluded: priced ? priced.isTaxIncluded : c.isTaxIncluded,
        costInfoId: c.costInfoId,
        netAmount: priced ? priced.netAmount : null,
        taxAmount: priced ? priced.taxAmount : null,
        grossAmount: priced ? priced.grossAmount : null,
        taxComponents: priced ? priced.components : [],
      }
    })
  }

  // The selected table's active session, grouped into chronological rounds.
  const tableRounds = useMemo(
    () => buildTableRounds(activeOrders, selectedTable),
    [activeOrders, selectedTable],
  )

  // A counter sale is ONE order, not a session: the customer pays and leaves
  // with a token, so there is no table to come back to and add a round to.
  // buildRoundIndex already treats a table-less order as its own round 1, which
  // is exactly the shape the bill summary and settle modal expect.
  const counterRounds = useMemo(() => {
    if (!counterOrderId) return []
    const r = buildRoundIndex(activeOrders).get(counterOrderId)
    return r ? [r] : []
  }, [counterOrderId, activeOrders])

  // Which branch's print format is in play. Resolved from the cart or the
  // selected table's rounds rather than at settle time, because the KOT prints
  // long before the bill does and needs the same format loaded and waiting.
  const activeBranchId = useMemo(() => (
    cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId
    || tableRounds[0]?.order?.BranchDetailId
    || counterRounds[0]?.order?.BranchDetailId
    || selectedTableRow?.BranchDetailId
    || null
  ), [cartItems, tableRounds, counterRounds, selectedTableRow])

  useEffect(() => {
    let live = true
    // Decoration for the print path only: no list just means no fallback.
    Promise.resolve()
      .then(() => posService.getPosBranches())
      .then((list) => {
        const branches = Array.isArray(list) ? list : []
        if (live) setSoleBranchId(branches.length === 1 ? (branches[0].Id || branches[0].id || null) : null)
      })
      .catch(() => { if (live) setSoleBranchId(null) })
    return () => { live = false }
  }, [])

  // Settling sets this to the branch the document was actually posted under,
  // which is the authority — so this only fills the gap before that happens.
  useEffect(() => {
    if (activeBranchId) setPrintBranchId((cur) => cur || activeBranchId)
  }, [activeBranchId])

  // WHAT THIS OUTLET ACCEPTS.
  //
  // The catalogue loaded above is tenant-wide: every method the business has
  // ever defined, portal settlement tenders included. Which of them THIS counter
  // offers is a per-branch decision, so it is read per branch — same shape as
  // the POS settings read below it.
  //
  // A failed read keeps the inherited list rather than emptying it: a till that
  // can take no money because a settings call timed out is worse than one
  // offering the tenant defaults.
  useEffect(() => {
    let cancelled = false
    if (!activeBranchId) return undefined
    // Called inside a resolved promise so a SYNCHRONOUS throw lands in .catch
    // too. A backend that does not serve this route yet, or anything else that
    // makes the call itself fail, must leave the counter on its inherited list —
    // never take the till down. Money is being taken on this screen.
    Promise.resolve()
      .then(() => posService.getBranchPaymentMethods(activeBranchId))
      .then((resolved) => {
        if (cancelled || !resolved?.methods) return
        setBranchMethods(resolved.methods)
      })
      // Leave whatever we already hold. A till that can take no money because a
      // settings call timed out is worse than one offering the tenant defaults.
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeBranchId])

  // WHAT THE COUNTER OFFERS. The outlet's resolved list once we have it;
  // until then the catalogue reduced to what an unconfigured outlet inherits —
  // which is still filtered, because the catalogue carries the portal
  // settlement tenders and those must never be one tap away at a counter.
  const paymentModes = useMemo(() => (
    branchMethods ? offeredModes(branchMethods) : defaultOfferedModes(paymentCatalogue)
  ), [branchMethods, paymentCatalogue])

  // Auto-print preference for that branch. Left ON when the read fails: a
  // missing ticket stops the kitchen, an unwanted print dialog does not.
  useEffect(() => {
    let cancelled = false
    if (!activeBranchId) return undefined
    posService.getPosSettings(activeBranchId)
      .then((cfg) => {
        if (cancelled) return
        setKotAutoPrint(cfg?.['kot.auto_print'] !== 'off')
        setNotePresets(parsePresets(cfg?.[NOTE_PRESETS_KEY]))
      })
      .catch(() => {
        if (cancelled) return
        setKotAutoPrint(true)
        setNotePresets(DEFAULT_NOTE_PRESETS)
      })
    return () => { cancelled = true }
  }, [activeBranchId])

  // Everything downstream — the bill, the settle modal, the discounts — reads
  // this one list and does not care which kind of sale produced it.
  const sessionRounds = counterMode ? counterRounds : tableRounds
  // A guest attached to any round of this session already names who owes a
  // balance; the ledger takes their name, so the till does not ask again.
  const sessionHasGuest = sessionRounds.some((r) => r.order?.CustomerId)

  // Whole-session bill (pre-discount) from the priced snapshots on each round.
  const sessionSummary = useMemo(
    () => summarizeSession(sessionRounds),
    [sessionRounds],
  )

  const waiterNameOf = useCallback(
    (id) => (id ? waiters.find((w) => w.Id === id)?.Name || null : null),
    [waiters],
  )

  // Guests and waiter for the table being served. Once a round exists the
  // rounds are the record, and the latest one that says wins: a party that
  // grew is written on every open round, and a round placed later carries the
  // grown number. Before the first round, the draft.
  const sessionService = useMemo(() => {
    if (tableRounds.length === 0) {
      return {
        guests: serviceDraft.guests,
        waiterId: serviceDraft.waiterId,
        waiterName: waiterNameOf(serviceDraft.waiterId),
      }
    }
    const latestFirst = [...tableRounds].reverse().map((r) => r.order || {})
    const g = latestFirst.find((o) => o.GuestCount != null)
    const w = latestFirst.find((o) => o.WaiterId)
    return {
      guests: g ? Number(g.GuestCount) : null,
      waiterId: w ? w.WaiterId : null,
      waiterName: w ? (w.WaiterName || waiterNameOf(w.WaiterId)) : null,
    }
  }, [tableRounds, serviceDraft, waiterNameOf])

  // A bill was printed and nothing has been added since: the table is waiting
  // on payment. A round placed after printing carries no stamp, which puts the
  // table back to running until the bill is printed again.
  const billPrintedAt = useMemo(() => {
    if (sessionRounds.length === 0) return null
    const stamps = sessionRounds.map((r) => r.order?.BillPrintedAt)
    if (stamps.some((x) => !x)) return null
    return [...stamps].sort().slice(-1)[0]
  }, [sessionRounds])

  // F2 puts the cursor in the dish search from anywhere on the till, the key
  // Petpooja-trained cashiers already reach for. F4 opens the table picker with
  // its finder focused, so "F4, G1, Enter" switches tables without the mouse.
  // Read through a ref so the listener, bound once, always calls today's
  // handler rather than the one from the first render.
  const onTillKey = useRef(null)
  onTillKey.current = (e) => {
    if (e.key === 'F2' && searchRef.current) {
      e.preventDefault()
      searchRef.current.focus()
      searchRef.current.select()
    } else if (e.key === 'F4') {
      e.preventDefault()
      // The board's finder, from anywhere — from takeaway too, which it
      // leaves for dine-in. A table being served stays served until another
      // is picked.
      if (counterMode) handleTableChange('')
      setFindFocusTick((n) => n + 1)
    }
  }
  useEffect(() => {
    const onKey = (e) => onTillKey.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (findFocusTick === 0 || !boardFindRef.current) return
    boardFindRef.current.focus()
    boardFindRef.current.select()
  }, [findFocusTick])

  // The till fills the window below wherever it starts. It used to subtract a
  // fixed 96px of chrome, but the workspace tabs and the Billing / Tables / QR
  // switcher above it were never counted, so the till ran ~100px past the
  // window and the foot of the category rail was cut off. Measured instead,
  // so whatever sits above it is accounted for.
  useLayoutEffect(() => {
    const el = billingRef.current
    if (!el) return undefined
    const measure = () => {
      const top = el.getBoundingClientRect().top + (window.scrollY || 0)
      el.style.setProperty('--till-top', `${Math.max(0, Math.round(top))}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [loading])

  // Each round's KOT status: 'pending' unless a later stage (ready/…) exists.
  // A round is only deletable while its kitchen ticket is still pending.
  const kotStatusByOrder = useMemo(() => {
    const m = {}
    ;(kots || []).forEach((k) => {
      const oid = k.OrderId || k.orderId
      if (!oid) return
      const s = String(k.Status || '').toLowerCase() || 'pending'
      const prev = m[oid]
      // Keep the most advanced status — anything past 'pending' blocks deletion.
      if (!prev || (prev === 'pending' && s !== 'pending' && s !== 'cancelled')) m[oid] = s
    })
    return m
  }, [kots])

  // The drafts that actually count: a chosen type with a real number behind it,
  // coerced to the numeric shape the pricing engine and the bill both expect.
  // Everything that leaves this component reads THIS, never the raw drafts.
  const activeLineDiscounts = useMemo(() => {
    const out = {}
    Object.entries(lineDiscounts).forEach(([ref, d]) => {
      const value = Number(d?.value)
      if (value > 0) out[ref] = { type: d.type, value }
    })
    return out
  }, [lineDiscounts])

  // Priceable lines across every committed round — used to re-quote the settle
  // total with the discount folded in (discount BEFORE tax) via the same server
  // engine the cart uses, so the preview never drifts from the raised bill.
  const settleLines = useMemo(() =>
    sessionRounds.flatMap((r) =>
      (r.items || []).map((it, i) => ({
        costInfoId: it.costInfoId || it.CostInfoId,
        quantity: Number(it.qty ?? it.quantity ?? 1) || 1,
        variantIds:
          it.variantIds ||
          (Array.isArray(it.variants) ? it.variants.map((v) => v.id || v.Id).filter(Boolean) : []),
        // Same fallback for add-ons: a round stored before this shipped carries
        // resolved objects and no id list, and dropping them here would preview
        // a total lower than the one the bill actually raises.
        addonIds:
          it.addonIds ||
          (Array.isArray(it.addons) ? it.addons.map((a) => a.id || a.Id).filter(Boolean) : []),
        ref: `${r.orderId}#${i}`,
        // The per-item discount, keyed by the same ref the bill will store it
        // under. The engine applies it to this line before tax, then spreads any
        // whole-bill discount on top.
        discount: activeLineDiscounts[`${r.orderId}#${i}`] || null,
      })),
    ).filter((l) => l.costInfoId),
  [sessionRounds, activeLineDiscounts])

  // Offer-preview lines for the committed rounds.
  //
  // Built to mirror posbill.repository.getOrderLinesTx EXACTLY, because the
  // point of this is that the number on screen equals the number that will be
  // charged. Same `<orderId>#<index>` ref, same fields, and `categoryId: null`
  // because the settle path has none either — sending one here would preview a
  // category offer that the real evaluation cannot fire.
  const settleOfferLines = useMemo(() =>
    sessionRounds.flatMap((r) =>
      (r.items || []).map((it, i) => ({
        ref: `${r.orderId}#${i}`,
        itemId: it.id || it.Id || null,
        categoryId: null,
        name: itemLabel(it),
        unitAmount: Number(it.price ?? it.unitAmount ?? 0) || 0,
        quantity: Number(it.qty ?? it.quantity ?? 1) || 1,
        hasManualDiscount: !!activeLineDiscounts[`${r.orderId}#${i}`],
      })),
    ),
  [sessionRounds, activeLineDiscounts])

  // Evaluated when the settle modal opens, and again if the cashier hand-
  // discounts a line — a manual discount takes a line off limits to offers, so
  // the answer genuinely changes.
  useEffect(() => {
    if (!settleOpen || settleOfferLines.length === 0) { setSettleOffers(null); return undefined }
    let cancelled = false
    const t = setTimeout(() => {
      // Offers must never stop a sale: a failed evaluation leaves the bill
      // priced without them, which is the same bill this screen raised before
      // campaigns existed. The try/catch is not belt-and-braces around the
      // promise — it catches a SYNCHRONOUS throw, which a rejection handler
      // never sees and which would surface as an uncaught error in this timer.
      try {
        Promise.resolve(posService.previewOffers(settleOfferLines, activeBranchId, customer?.Id || null))
          .then((res) => { if (!cancelled) setSettleOffers(res) })
          .catch(() => { if (!cancelled) setSettleOffers(null) })
      } catch {
        if (!cancelled) setSettleOffers(null)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [settleOpen, settleOfferLines, activeBranchId, customer])

  // What the bill will actually be priced with: the cashier's own discounts,
  // plus the campaign ones on every line they did not touch. Mirrors
  // offerEngine.mergeLineDiscounts — manual wins, always.
  const effectiveSettleLines = useMemo(() => {
    const fromOffers = settleOffers?.lineDiscounts || {}
    if (Object.keys(fromOffers).length === 0) return settleLines
    return settleLines.map((l) => (
      l.discount ? l : { ...l, discount: fromOffers[l.ref] || null }
    ))
  }, [settleLines, settleOffers])

  // Display labels for those lines, keyed by ref. Kept OUT of settleLines
  // because the quote endpoint rejects unknown keys — the wire shape is the
  // contract, and decorating it for the UI would 400 the whole settle.
  const settleLineLabels = useMemo(() => {
    const map = {}
    sessionRounds.forEach((r) => {
      (r.items || []).forEach((it, i) => {
        map[`${r.orderId}#${i}`] = itemLabel(it)
      })
    })
    return map
  }, [sessionRounds])

  // Re-quote (debounced) whenever the settle modal is open and the discount
  // changes. Falls back to a snapshot estimate when nothing is priceable.
  useEffect(() => {
    if (!settleOpen || effectiveSettleLines.length === 0) { setSettleQuote(null); return }
    const value = Number(settleDiscount) || 0
    let cancelled = false
    const t = setTimeout(() => {
      // Quoted from the lines WITH campaign discounts folded in. Quoting the
      // undiscounted lines is what let the modal ask for ₹500 on a bill that
      // settled at ₹450: the cashier collected the higher figure, gave no
      // change, and the drawer came up over at close.
      posService
        .quotePricing(effectiveSettleLines, value > 0 ? { type: settleDiscountType, value } : null)
        .then((res) => { if (!cancelled) setSettleQuote(res) })
        .catch(() => { if (!cancelled) setSettleQuote(null) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [settleOpen, settleDiscount, settleDiscountType, effectiveSettleLines])

  // Numbers shown in the settle modal: prefer the live server quote; otherwise
  // estimate the discount effect from the session snapshot totals.
  //
  // `payable` is the gross ROUNDED TO THE NEAREST RUPEE, because that is what the
  // ledger will invoice (see roundPayable). Quoting the unrounded gross here made
  // "Exact" hand over less than the invoice asked for, and the sale posted
  // PARTIALLY_PAID over a few paise nobody could see.
  const settleTotals = useMemo(() => {
    const value = Number(settleDiscount) || 0
    if (settleQuote?.totals) {
      const t = settleQuote.totals
      const gross = Number(t.grossAmount) || 0
      const { payable, roundOff } = roundPayable(gross)
      return {
        subTotal: sessionSummary.subTotal,
        discount: Number(t.discountAmount) || 0,
        taxable: Number(t.netAmount) || 0,
        tax: Number(t.taxAmount) || 0,
        gross,
        roundOff,
        payable,
        taxByComponent: t.taxByComponent || [],
        estimated: false,
      }
    }
    // Fallback estimate: resolve a % into a ₹ amount off the subtotal first, so
    // both discount modes flow through the same amount-based estimator.
    const resolvedAmount = settleDiscountType === 'percent'
      ? (sessionSummary.subTotal * value) / 100
      : value
    const est = estimateAfterDiscount(sessionSummary, resolvedAmount)
    const { payable, roundOff } = roundPayable(est.total)
    return {
      subTotal: sessionSummary.subTotal,
      discount: est.discount,
      taxable: est.taxable,
      tax: est.tax,
      gross: est.total,
      roundOff,
      payable,
      taxByComponent: [],
      estimated: true,
    }
  }, [settleQuote, sessionSummary, settleDiscount, settleDiscountType])

  // The whole-bill part of the discount, on its own.
  //
  // Taken from the quote's per-line bill shares rather than from the input,
  // because the server has already resolved a percentage and capped the value at
  // what is actually being sold. Sending the raw input instead would disagree
  // with the payable the cashier just read whenever either applied.
  const billDiscountAmount = useMemo(() => {
    const lines = settleQuote?.lines
    if (Array.isArray(lines) && lines.length > 0) {
      const sum = lines.reduce((s, l) => s + (Number(l.billDiscountAmount) || 0), 0)
      return Math.round(sum * 100) / 100
    }
    // No quote: fall back to the typed amount, resolving a % off the subtotal.
    const value = Number(settleDiscount) || 0
    const resolved = settleDiscountType === 'percent'
      ? (sessionSummary.subTotal * value) / 100
      : value
    return Math.round(resolved * 100) / 100
  }, [settleQuote, settleDiscount, settleDiscountType, sessionSummary])

  // Per-line item discount in rupees, keyed by the ref the row was sent under —
  // the quote echoes `ref` back untouched. Lets each row show what its ₹ or %
  // actually took off, which is the only confirmation a % input ever gets.
  const lineDiscountOff = useMemo(() => {
    const map = {}
    const lines = settleQuote?.lines
    if (!Array.isArray(lines)) return map
    lines.forEach((l) => {
      if (l.ref) map[l.ref] = Number(l.itemDiscountAmount) || 0
    })
    return map
  }, [settleQuote])

  // What the per-item discounts came to, for the settle modal's breakdown.
  const itemDiscountAmount = useMemo(() => {
    const lines = settleQuote?.lines
    if (!Array.isArray(lines)) return 0
    const sum = lines.reduce((s, l) => s + (Number(l.itemDiscountAmount) || 0), 0)
    return Math.round(sum * 100) / 100
  }, [settleQuote])

  // ── Tenders ───────────────────────────────────────────────────────────────
  // Balance due is the number a cashier actually works to, so it drives both
  // the display and whether Settle is allowed.
  const payable = Number(settleTotals.payable) || 0
  const tendered = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const balanceDue = Math.round((payable - tendered) * 100) / 100
  const changeDue = balanceDue < 0 ? Math.abs(balanceDue) : 0

  const modeName = (id) => {
    const m = paymentModes.find((p) => (p.id || p.Id) === id)
    return m ? (m.Type || m.type || '') : ''
  }
  // A method the business marked as needing one must carry a reference, or the
  // takings cannot be reconciled. The METHOD says so, not its name: this was a
  // match against ['card','upi','wallet'], so renaming 'Card' to 'Credit Card'
  // silently stopped requiring one — and 'Amex' never required one at all. The
  // ledger enforces the same flag server-side, so the two cannot drift.
  const needsRef = (id) => {
    const m = paymentModes.find((p) => (p.id || p.Id) === id)
    return !!(m && (m.RequiresReference ?? m.requiresReference))
  }
  const missingRef = tenders.some((t) => needsRef(t.paymentModeId) && !String(t.refNo || '').trim())
  // Paid short with nobody named as owing the rest.
  const missingDebtor = balanceDue > 0 && tenders.length > 0 && !sessionHasGuest && !debtorName.trim()

  const addTender = (amount) => {
    const first = paymentModes[0]
    if (!first) return
    setTenders((prev) => [...prev, {
      key: `t${Date.now()}${prev.length}`,
      paymentModeId: first.id || first.Id,
      amount: amount !== undefined ? amount : Math.max(0, balanceDue),
      refNo: '',
      // Auto-seeded rows track the payable; a manual edit pins them.
      auto: amount !== undefined,
    }])
  }
  const updateTender = (key, patch) =>
    setTenders((prev) => prev.map((t) => (
      t.key === key
        // Editing the amount takes ownership of the row, so it stops tracking.
        ? { ...t, ...patch, auto: patch.amount !== undefined ? false : t.auto }
        : t
    )))
  const removeTender = (key) => setTenders((prev) => prev.filter((t) => t.key !== key))

  // A fresh name for every bill — carrying the last debtor into the next table
  // would put a stranger's name on someone else's balance.
  useEffect(() => {
    if (!settleOpen) { setDebtorName(''); setDebtorMobile('') }
  }, [settleOpen])

  // Seed one tender for the full payable the moment the modal opens — the
  // common case is a single payment, and this makes it a one-tap settle.
  useEffect(() => {
    if (!settleOpen) { setTenders([]); return }
    if (paymentModes.length === 0 || payable <= 0) return

    setTenders((prev) => {
      if (prev.length === 0) {
        // The method picked in the order panel, if the outlet still offers it.
        const picked = paymentModes.find((m) => (m.id || m.Id) === payModeId)
        const first = picked || paymentModes[0]
        return [{ key: 't0', paymentModeId: first.id || first.Id, amount: payable, refNo: '', auto: true }]
      }
      // Keep a single untouched row in step with the payable — otherwise
      // changing the discount leaves a stale amount and a phantom balance.
      if (prev.length === 1 && prev[0].auto) {
        return [{ ...prev[0], amount: payable }]
      }
      return prev
    })
    // Deliberately not keyed on `tenders`: re-seeding on every edit would fight
    // the cashier mid-entry.
  }, [settleOpen, paymentModes, payable, payModeId])

  // Picking a table targets its latest round for KOT firing / context.
  useEffect(() => {
    if (!selectedTable) { setSelectedOrderId(null); return }
    const rounds = buildTableRounds(activeOrders, selectedTable)
    setSelectedOrderId(rounds.length ? rounds[rounds.length - 1].orderId : null)
  }, [selectedTable, activeOrders])

  // Selecting a table RESUMES it: fetch that table's live rounds from the server
  // rather than trusting the list loaded at mount.
  //
  // This matters on the second visit to an occupied table. The mount-time list is
  // one page deep and already stale by the time a shift is busy — another till may
  // have added a round, or settled the table entirely. Asking for this table
  // specifically is both correct and cheap, and it is what makes "select an
  // occupied table and carry on" trustworthy rather than usually-right.
  useEffect(() => {
    if (!selectedTable) { setSessionLoading(false); return }
    let cancelled = false
    setSessionLoading(true)
    posService
      .getOrders({ tableId: selectedTable, openOnly: true, limit: MAX_LIMIT })
      .then((rows) => {
        if (cancelled) return
        // Merge rather than replace: activeOrders also backs the Transfer sheet,
        // which needs to know about tables other than this one.
        setActiveOrders((prev) => {
          const fresh = Array.isArray(rows) ? rows : []
          const freshIds = new Set(fresh.map((o) => o.id || o.Id))
          return [
            // Drop this table's stale rows — including any that have since been
            // settled, so a closed table stops looking occupied.
            ...prev.filter((o) => o.TableId !== selectedTable && !freshIds.has(o.id || o.Id)),
            ...fresh,
          ]
        })
      })
      // A failed refresh falls back to the list already in hand rather than
      // emptying the screen — stale context beats no context at a till.
      .catch(() => { if (!cancelled) toast.warn('Could not refresh this table — showing last known order') })
      .finally(() => { if (!cancelled) setSessionLoading(false) })
    return () => { cancelled = true }
  }, [selectedTable])

  // Choosing, changing or leaving a table. Unsaved dishes are NOT cleared: they
  // wait at the top of the table picker and go onto whichever table is picked
  // next. That is how dishes tapped before a table was chosen reach it, and it
  // means "Change table" can never silently throw away an order being taken.
  // The waiting banner names them, so they cannot ride along unnoticed.
  const handleTableChange = (tableId) => {
    if (tableId && tableId !== selectedTable && selectedTable && cartItems.length > 0) {
      const n = cartItems.reduce((q, c) => q + c.qty, 0)
      const to = tables.find((t) => (t.id || t.Id) === tableId)
      toast.info(`${n} unsaved ${n === 1 ? 'dish' : 'dishes'} moved to ${to?.Name || to?.name || 'the new table'}`)
    }
    // Guests and waiter belong to the table they were typed for.
    if (tableId !== selectedTable) {
      setServiceDraft({ guests: null, waiterId: null })
      setServiceEditOpen(false)
    }
    // Leaving the counter is the same kind of move: whatever was on it was for
    // the customer standing there, not for the table being opened.
    setCounterMode(false)
    setCounterOrderId(null)
    setSelectedTable(tableId)
  }

  // Switch the till to counter service for a NEW sale. Unsaved dishes come
  // along — switching how an order is sold is not starting a different one.
  const handlePickCounter = () => {
    setSelectedTable('')
    setSelectedOrderId(null)
    setCounterOrderId(null)
    setCounterMode(true)
    setServiceEditOpen(false)
  }

  // A table chosen on the board folds it back to one row: the menu is next.
  const pickFromBoard = (tableId) => {
    handleTableChange(tableId)
    setBoardOpen(false)
  }

  // Seat the walk-in party at the table offered for them. Their number goes
  // onto the order as its guests, so nobody types it twice.
  const seatWalkIn = (tableId, guests) => {
    pickFromBoard(tableId)
    setServiceDraft({ guests, waiterId: null })
  }

  // Reopen a counter sale that was rung up but never paid for.
  //
  // This is the counterpart of picking an occupied table, and it was missing.
  // A counter order's id lived only in `counterOrderId`, set once when the
  // order was created and cleared by starting the next one — so ringing up a
  // second customer stranded the first: food made, order open, and no way back
  // to take the money. The order was not lost, only unreachable; everything
  // below (rounds, bill summary, settle) already works from the id alone.
  const handleResumeCounter = (orderId) => {
    if (cartItems.length > 0) {
      setCartItems([])
      toast.info('Cart cleared — it belonged to the previous sale')
    }
    setSelectedTable('')
    setSelectedOrderId(null)
    setCounterOrderId(orderId)
    setCounterMode(true)
  }

  // Has this round reached the kitchen? The presence of a ticket is the real
  // answer — the order's own 'fired' status is only a shadow of it, and the two
  // can differ if a ticket was cancelled. Used to label the button and to warn
  // before settling.
  const isRoundSent = (r) => !!kotStatusByOrder[r?.orderId] || /fired/i.test(String(r?.status || ''))
  const selectedRound = sessionRounds.find((r) => r.orderId === selectedOrderId) || null
  const selectedSent = isRoundSent(selectedRound)

  // Rounds nobody sent to the kitchen. Settling is still allowed — a drink
  // served from the counter never needs a ticket — but it must not be silent.
  const unsentRounds = sessionRounds.filter((r) => !isRoundSent(r))

  // Delete a whole round even after its KOT fired — the customer changed the
  // order. The server pulls the KOT from the kitchen and frees the table.
  const handleDeleteRound = async () => {
    if (!deleteTarget) return
    setDeletingRound(true)
    try {
      await posService.deleteOrder(deleteTarget.orderId)
      toast.success(`Round ${deleteTarget.round} deleted`)
      const lastRound = sessionRounds.length <= 1
      setDeleteTarget(null)
      if (lastRound) setSelectedTable('')
      else if (selectedOrderId === deleteTarget.orderId) setSelectedOrderId(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete round')
    } finally {
      setDeletingRound(false)
    }
  }

  // Append the cart to the selected table's session as a new round (new order).
  const handleAddRound = async () => {
    if (!selectedTable) { toast.warn('Select a table first'); return }
    if (cartItems.length === 0) { toast.warn('Add items to cart first'); return }
    const isFirst = sessionRounds.length === 0
    try {
      const tableObj = tables.find((t) => (t.id || t.Id) === selectedTable)
      // OrderNo comes from the server's numbering series. It used to be minted
      // here from the last 6 digits of Date.now(), which wraps every ~16m40s and
      // then collides with UNIQUE (OrderNo, TenantId) — the round just failed.
      const order = await posService.createOrder({
        TableId: selectedTable,
        OrderType: 'dinein',
        Items: buildOrderItems(),
        // Null for a walk-in — the settle path already carries this through to
        // the ledger contact and the CRM projection.
        CustomerId: customer?.Id || null,
        BranchDetailId: tableObj?.BranchDetailId || null,
        // Kept on the round until it is sent, then printed on its ticket.
        CookingInstructions: orderNote.trim() || null,
        // Every round carries the table's guests and waiter, so a round moved
        // to another table takes them along. Left out when nobody said.
        ...(sessionService.guests != null ? { GuestCount: sessionService.guests } : {}),
        ...(sessionService.waiterId ? { WaiterId: sessionService.waiterId } : {}),
      })
      const orderId = order.id || order.Id
      if (isFirst) {
        // First round opens the session and marks the table occupied
        await posService.setTableOccupancy(selectedTable, { Status: 'occupied', CurrentOrderId: orderId })
      }
      // Placing a round does NOT send it to the kitchen — that is a separate,
      // deliberate tap. Say so, because a waiter who assumes otherwise is how a
      // round ends up never being cooked.
      const roundNo = isFirst ? 1 : sessionRounds.length + 1
      toast.success(`Round ${roundNo} added — press Send KOT when it is ready to cook`)
      setCartItems([])
      setCustomer(null)
      resetKitchenNotes()
      setSelectedOrderId(orderId)
      await load()
      // The round is the record now; the draft has done its job.
      if (isFirst) setServiceDraft({ guests: null, waiterId: null })
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to add round')
    }
  }

  // Counter service: commit the cart as one takeaway order, send it to the
  // kitchen, and go straight to payment.
  //
  // The order is created BEFORE the settle modal opens so the bill is priced by
  // the same server path a dine-in bill goes through — the alternative, billing
  // a cart the server has never seen, is how the till and the invoice end up
  // disagreeing. If the cashier abandons the modal, the order is left unsettled
  // and can be finished from the queue rather than being lost.
  //
  // The branch comes from the items themselves: pos_item_meta.BranchDetailId is
  // NOT NULL, and a till necessarily sells one branch's menu — so there is
  // nothing to ask the cashier.
  const handleCounterOrder = async () => {
    if (cartItems.length === 0) { toast.warn('Add items to cart first'); return }
    const branchId = cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId || null

    setCounterBusy(true)
    try {
      const order = await posService.createOrder({
        TableId: null,
        OrderType: 'takeaway',
        Items: buildOrderItems(),
        CustomerId: customer?.Id || null,
        BranchDetailId: branchId,
        CookingInstructions: orderNote.trim() || null,
        NoCutlery: noCutlery,
      })
      const orderId = order.id || order.Id
      // Counter food is being made now — there is no later moment to decide to
      // send it, which is why this fires the ticket rather than leaving it to a
      // second tap the way a dine-in round does.
      try {
        const kot = await posService.fireKot(orderId)
        // The cart is cleared immediately below, so the lines are taken from it
        // here while they still exist rather than from a reload.
        if (kotAutoPrint) {
          print('kot', buildKotPrintData({
            kot,
            items: buildOrderItems(),
            tableName: 'COUNTER',
            orderInstructions: orderNote.trim() || null,
            noCutlery,
          }))
        }
      } catch {
        toast.warn('Order placed, but the kitchen ticket did not send — check the KDS')
      }
      setCartItems([])
      setCustomer(null)
      resetKitchenNotes()
      setCounterOrderId(orderId)
      await load()
      setSettleOpen(true)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to place the counter order')
    } finally {
      setCounterBusy(false)
    }
  }

  // Reverse a committed transfer by replaying the server-supplied inverse.
  const runUndo = async (undo) => {
    try {
      await posService.transferOrder(undo)
      toast.success('Transfer undone')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not undo the transfer')
    }
  }

  const handleTransfer = async (payload) => {
    if (!payload?.toTableId) { toast.warn('Pick a destination table'); return }
    setTransferBusy(true)
    try {
      const res = await posService.transferOrder(payload)
      setTransferOpen(false)
      // Offer an immediate Undo; the server hands back the exact inverse.
      const undo = res?.undo
      toast.success(
        <span className="fd-undo-toast">
          <span>Items transferred</span>
          {undo && <button onClick={() => runUndo(undo)}>Undo</button>}
        </span>,
        { autoClose: 8000 },
      )
      // Moving a whole table clears the current selection.
      if (payload.scope === 'orders' && payload.orderIds?.length === sessionRounds.length) {
        setSelectedTable('')
      }
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to transfer')
    } finally {
      setTransferBusy(false)
    }
  }

  // Send this round to the kitchen. The server is send-once: a round that
  // already has a live ticket gets no second one, so a double-tap cannot put the
  // same food on the pass twice. The toast says which happened.
  const handleSendKot = async () => {
    if (!selectedOrderId) { toast.warn('Select a round first'); return }
    try {
      const kot = await posService.fireKot(selectedOrderId)
      if (kot?.AlreadySent) {
        // Deliberately no auto-print on a re-send: the ticket is already on the
        // pass and a second one appearing by itself is how a kitchen ends up
        // cooking a round twice. Reprint from the Kitchen board when it is
        // genuinely lost — that is an explicit act by someone who can see it.
        toast.info(`Already in the kitchen (${kot.KotNo || 'KOT'})`)
      } else {
        toast.success(`Sent to the kitchen (${kot?.KotNo || 'KOT'})`)
        if (kotAutoPrint) {
          const round = sessionRounds.find((r) => r.orderId === selectedOrderId)
          print('kot', buildKotPrintData({
            kot,
            round,
            tableName: selectedTableName,
            waiter: sessionService.waiterName,
            orderInstructions: round?.order?.CookingInstructions || null,
            noCutlery: round?.order?.NoCutlery,
          }))
        }
      }
      load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send to the kitchen')
    }
  }

  // Guests and waiter, from the editor in the order panel's header. Before the
  // first round there is nothing to write to, so it is kept as the draft that
  // round will carry; after it, every open round is updated at once.
  const saveServiceDetails = async ({ guests, waiterId }) => {
    const changes = {}
    if (guests !== sessionService.guests) changes.GuestCount = guests
    if ((waiterId || null) !== (sessionService.waiterId || null)) changes.WaiterId = waiterId
    if (Object.keys(changes).length === 0) { setServiceEditOpen(false); return }

    if (tableRounds.length === 0) {
      setServiceDraft({ guests, waiterId })
      setServiceEditOpen(false)
      return
    }

    const orderIds = tableRounds.map((r) => r.orderId)
    setServiceSaving(true)
    try {
      const res = await Promise.resolve().then(
        () => posService.setOrderServiceDetails({ orderIds, ...changes }),
      )
      // Reflected in place rather than by a reload: nothing else on the table
      // changed, and a reload would redraw the whole till for two fields.
      const ids = new Set(orderIds)
      setActiveOrders((prev) => prev.map((o) => (
        ids.has(o.id || o.Id)
          ? {
            ...o,
            ...('GuestCount' in changes ? { GuestCount: changes.GuestCount } : {}),
            ...('WaiterId' in changes
              ? { WaiterId: changes.WaiterId, WaiterName: res?.WaiterName ?? waiterNameOf(changes.WaiterId) }
              : {}),
          }
          : o
      )))
      setServiceEditOpen(false)
      toast.success(`${selectedTableName} updated`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not update guests and waiter')
    } finally {
      setServiceSaving(false)
    }
  }

  /**
   * Print the bill for the guest to check, BEFORE they pay.
   *
   * Not the invoice. No number is issued and nothing is posted: the invoice is
   * raised on settlement, and a guest who asks for one more coffee after reading
   * this must still be able to have it. So the paper says so.
   *
   * Priced by the server exactly as Settle will price it — the same lines, the
   * same campaign offers folded in — so the figure the guest checks is the
   * figure they are then asked for. Falls back to the stored round snapshots
   * when nothing on the table can be re-quoted.
   */
  const printProvisionalBill = async () => {
    if (sessionRounds.length === 0) return
    setBillPrinting(true)
    try {
      let doc = null
      if (settleLines.length > 0) {
        try {
          const offers = await Promise.resolve()
            .then(() => posService.previewOffers(settleOfferLines, activeBranchId, customer?.Id || null))
            .catch(() => null)
          const fromOffers = offers?.lineDiscounts || {}
          const lines = settleLines.map((l) => (l.discount ? l : { ...l, discount: fromOffers[l.ref] || null }))
          const q = await posService.quotePricing(lines)
          const qtyByRef = new Map(lines.map((l) => [l.ref, l.quantity]))
          const t = q?.totals || {}
          const { payable: total, roundOff } = roundPayable(Number(t.grossAmount) || 0)
          doc = {
            Lines: (q?.lines || []).map((l) => {
              const quantity = Number(l.quantity ?? qtyByRef.get(l.ref) ?? 1) || 1
              const gross = Number(l.grossAmount) || 0
              return {
                ItemName: settleLineLabels[l.ref] || 'Item',
                Quantity: quantity,
                UnitPrice: Number(l.unitAmount ?? gross / quantity) || 0,
                GrossAmount: gross,
                variants: l.variants,
                addons: l.addons,
              }
            }),
            NetAmount: Number(t.netAmount) || 0,
            DiscountAmount: Number(t.discountAmount) || 0,
            TaxAmount: t.taxCharged === false ? 0 : Number(t.taxAmount) || 0,
            TaxByComponent: t.taxCharged === false ? [] : (t.taxByComponent || []),
            RoundOff: roundOff,
            GrossAmount: total,
          }
        } catch {
          doc = null
        }
      }
      if (!doc) {
        const { payable: total, roundOff } = roundPayable(sessionSummary.total)
        doc = {
          Lines: sessionSummary.items.map((i) => ({
            ItemName: i.name,
            Quantity: i.qty,
            UnitPrice: i.qty ? i.gross / i.qty : i.gross,
            GrossAmount: i.gross,
            variants: i.line?.variants,
            addons: i.line?.addons,
          })),
          NetAmount: sessionSummary.subTotal,
          TaxAmount: sessionSummary.tax,
          TaxByComponent: sessionSummary.taxByComponent,
          RoundOff: roundOff,
          GrossAmount: total,
        }
      }

      print('bill', {
        ...doc,
        provisional: true,
        taxMode,
        TransactionDate: new Date().toISOString(),
        tableName: counterMode ? null : selectedTableName,
        waiter: sessionService.waiterName,
        CustomerName: customer?.Name || customer?.name || null,
        CustomerMobile: customer?.Phone || null,
      })

      // The stamp is what turns the table "waiting on payment" on the floor
      // plan. The paper is already out, so a failed stamp is reported rather
      // than treated as a failed print.
      const orderIds = sessionRounds.map((r) => r.orderId)
      try {
        const res = await Promise.resolve().then(() => posService.markBillPrinted(orderIds))
        const at = res?.BillPrintedAt || new Date().toISOString()
        const ids = new Set(orderIds)
        setActiveOrders((prev) => prev.map((o) => (ids.has(o.id || o.Id) ? { ...o, BillPrintedAt: at } : o)))
      } catch {
        toast.warn('Bill printed, but the table could not be marked as waiting on payment')
      }
    } finally {
      setBillPrinting(false)
    }
  }

  const handleSettleBill = async () => {
    if (!selectedTable && !counterMode) { toast.warn('Select a table first'); return }
    if (sessionRounds.length === 0) { toast.warn('No active order to settle'); return }
    if (tenders.length === 0) { toast.warn('Add at least one payment'); return }
    // Which methods need one is the tenant's decision now, so the message no
    // longer names a fixed three.
    if (missingRef) { toast.warn('Enter a reference number for this payment method'); return }
    if (missingDebtor) { toast.warn('Enter the name of the person who owes the balance'); return }
    setSettling(true)
    try {
      // The server recomputes the bill from every round it covers and applies
      // the discount BEFORE tax, so no totals are calculated here. Sending
      // OrderIds is what lets it do that — OrderId alone only named round 1.
      //
      // Discount is sent as TWO separate things, and conflating them would
      // double-count: pos_bill.Discount is the whole-bill reduction only, while
      // the per-item ones travel as LineDiscounts and are re-applied per line.
      //
      // The bill takes a flat ₹ figure, so a % is resolved here — and resolved
      // from the quote's own per-line bill shares rather than by multiplying the
      // subtotal, because the server already capped and apportioned it.
      const discount = billDiscountAmount
      // BillNo, like OrderNo, is issued by the server's numbering series.
      const bill = await posService.createBill({
        OrderIds: sessionRounds.map((r) => r.orderId),
        Discount: discount,
        LineDiscounts: activeLineDiscounts,
        // Status is NOT sent: a bill is born 'unpaid' server-side and settling
        // is what changes that. This used to send 'Pending', a value no reader
        // in either codebase compares against — the bill was invisible to every
        // status filter it should have appeared in.
        BranchDetailId: sessionRounds[0].order.BranchDetailId || null,
      })
      const billId = bill.id || bill.Id
      // One tender per row — the server turns each into a paymentbreakup with
      // its own instrument, and posts the whole thing as a ledger document.
      const settled = await posService.settleBill(billId, {
        Tenders: tenders.map((t) => ({
          paymentModeId: t.paymentModeId,
          amount: Number(t.amount) || 0,
          refNo: String(t.refNo || '').trim() || null,
        })),
        Discount: discount,
        LineDiscounts: activeLineDiscounts,
        // Only when paid short. A guest on the table is named by the server.
        ...(balanceDue > 0 && debtorName.trim()
          ? { Debtor: { Name: debtorName.trim(), Mobile: debtorMobile.trim() || null } }
          : {}),
      })

      const fullySettled = !(Number(settled?.BalanceDue) > 0)
      // Close every round and free the table — paid in full OR part-paid. The
      // meal is over either way: a part-paid bill is already invoiced, and the
      // balance is collected from Money → Dues. Leaving the table open used to
      // invite a second Settle, which invoiced the same food twice. A counter
      // sale has no table — the customer left with a token instead.
      await Promise.all(sessionRounds.map((r) => posService.updateOrder(r.orderId, { Status: 'closed' })))
      if (selectedTable) {
        await posService.setTableOccupancy(selectedTable, { Status: 'free', CurrentOrderId: null })
      }

      // Which branch's format this bill prints in. Taken from the cart the same
      // way the KOT does — the till itself is not branch-scoped, its items are.
      // A COUNTER sale has already emptied the cart: handleCounterOrder commits
      // the order and clears it before this modal ever opens. So the rounds
      // being settled are the source, and the cart is only a last resort — read
      // the other way round, a counter bill printed with no branch (and so the
      // wrong receipt format) and a token slip claiming nought items.
      const printBranch = settled?.BranchDetailId
        || sessionRounds[0]?.order?.BranchDetailId
        || cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId
        // The table's. With none, null — and the till prints under the
        // tenancy's only branch, if it has just one.
        || activeBranchId
        || null
      const settledItemCount = sessionRounds.reduce(
        (n, r) => n + (r.items || []).length, 0,
      ) || cartItems.length

      // The invoice number is the customer-facing artefact, so it headlines the
      // confirmation rather than a generic success toast.
      setPrintBranchId(printBranch)
      setSettledInvoice({
        // The posted document, so Print can fetch the real lines and tax rather
        // than reconstructing a bill from the cart it happens to still hold.
        logId: settled?.TransactionDetailLogId || null,
        branchId: printBranch,
        itemCount: settledItemCount,
        transactionNo: settled?.TransactionNo || null,
        total: Number(settled?.Total) || payable,
        balanceDue: Number(settled?.BalanceDue) || 0,
        // Enough to open the Collect sheet on this invoice straight away.
        paid: Math.max(0, Math.round(((Number(settled?.Total) || payable) - (Number(settled?.BalanceDue) || 0)) * 100) / 100),
        debtor: debtorName.trim()
          ? [debtorName.trim(), debtorMobile.trim()].filter(Boolean).join(' · ')
          : null,
        tableName: counterMode ? null : selectedTableName,
        tenders: tenders.map((t) => ({ mode: modeName(t.paymentModeId), amount: Number(t.amount) || 0, refNo: t.refNo })),
        // Minted by the server inside the settle transaction. It headlines the
        // confirmation because it is the only thing the customer walks away
        // with — nobody can call a number that was never shown to the cashier.
        tokenLabel: settled?.TokenLabel || null,
      })
      toast.success(fullySettled ? 'Bill settled and posted to ledger' : 'Partial payment recorded')
      setSettleOpen(false)
      setSettleDiscount(0)
      setSettleDiscountType('amount')
      // Per-item discounts belong to the bill just settled — carrying them into
      // the next table would silently give the same dish away twice.
      setLineDiscounts({})
      setDiscountMode('bill')
      setTenders([])
      // The rounds are closed either way (see above), so the till lets go of
      // them either way. The till STAYS on the counter — the next customer is
      // already there. Only the finished order is let go of.
      setSelectedOrderId(null)
      setSelectedTable('')
      setCounterOrderId(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to settle bill')
    } finally {
      setSettling(false)
    }
  }

  if (loading) return <div className="fd-loading">Loading billing...</div>

  /**
   * Add the item an offer is waiting to discount.
   *
   * A free item has to EXIST as a line before anything can be taken off it —
   * that is why the engine reports these as "earned" rather than applying them.
   * The alternative is a phantom line the kitchen never sees and the stock
   * never loses.
   *
   * @param {string} rewardItemId - An itemdetail id, from the offer.
   */
  const addRewardItem = (rewardItemId) => {
    // The cart is keyed by MENU entry; an offer names the catalogue item behind
    // it. One dish can appear on the menu more than once (different channels),
    // so the first match is the one a cashier would have tapped.
    const meta = menu.find((m) => m.ItemDetailId === rewardItemId)
    if (!meta) {
      toast.error('That item is not on this branch\u2019s menu, so it cannot be added here')
      return
    }
    addToCart(meta, [])
    toast.success(`${itemName(meta, itemDetails[meta.ItemDetailId])} added \u2014 the offer will apply`)
    setOfferCheck(null)
  }

  /**
   * "Check offers" — what would apply to the cart as it stands.
   *
   * Deliberately not the authority: the server re-evaluates inside the settle
   * transaction from the live rules, so this cannot grant a discount and its
   * absence cannot withhold one.
   */
  const checkOffers = async () => {
    const branchId = cartItems.find((c) => c.meta?.BranchDetailId)?.meta.BranchDetailId || null
    setCheckingOffers(true)
    try {
      const lines = cartItems.map((c) => ({
        ref: c.lineKey,
        itemId: c.itemId || null,
        categoryId: c.categoryId || null,
        name: c.name,
        unitAmount: Number(c.price) || 0,
        quantity: Number(c.qty) || 0,
        hasManualDiscount: !!lineDiscounts[c.lineKey],
      }))
      setOfferCheck(await posService.previewOffers(lines, branchId, customer?.Id || null))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not check offers')
    } finally {
      setCheckingOffers(false)
    }
  }

  /**
   * Print the bill just settled.
   *
   * Reads the posted LEDGER DOCUMENT rather than rebuilding a bill from the cart
   * still in memory. The cart knows what was ordered; only the document knows
   * what was CHARGED — the discount that was spread across lines, the tax
   * components as they were actually computed, the round-off. Printing from the
   * cart is how a customer's paper stops matching the books.
   */
  const printBill = async () => {
    if (!settledInvoice?.logId) return
    setPrinting(true)
    try {
      const doc = await posService.getLedgerDocument(settledInvoice.logId)
      print('bill', {
        ...doc,
        // The invoice's own mode: a tax invoice issued before GST was switched
        // off still prints as a tax invoice.
        taxMode: doc.TaxMode || taxMode,
        tokenLabel: doc.Source?.kind === 'token' ? doc.Source.label : settledInvoice.tokenLabel,
        tableName: doc.Source?.kind === 'table' ? doc.Source.label : null,
        balanceDue: settledInvoice.balanceDue,
      })
    } catch {
      toast.error('Could not load the bill to print')
    } finally {
      setPrinting(false)
    }
  }

  /** The slip a counter customer walks away holding. */
  const printToken = () => print('tokenSlip', {
    tokenLabel: settledInvoice.tokenLabel,
    TransactionNo: settledInvoice.transactionNo,
    TransactionDate: new Date().toISOString(),
    GrossAmount: settledInvoice.total,
    itemCount: settledInvoice.itemCount,
  })

  // ── What the order panel says about where this table stands ──────────────
  const nextRound = sessionRounds.length + 1
  const roundPill = (() => {
    if (counterMode) {
      return sessionRounds.length > 0
        ? { tone: 'is-wait', label: 'Unpaid' }
        : { tone: 'is-new', label: 'New sale' }
    }
    if (pickingTable) return { tone: 'is-new', label: 'Dine-in' }
    if (cartItems.length > 0) return { tone: 'is-draft', label: `Round ${nextRound} · not saved` }
    if (sessionRounds.length === 0) return { tone: 'is-new', label: 'New order' }
    if (billPrintedAt) {
      const at = formatRoundTime(billPrintedAt)
      return { tone: 'is-printed', label: `Bill printed${at ? ` ${at}` : ''}` }
    }
    const round = selectedRound || sessionRounds[sessionRounds.length - 1]
    return isRoundSent(round)
      ? { tone: 'is-sent', label: `Round ${round.round} · in kitchen` }
      : { tone: 'is-draft', label: `Round ${round.round} · not sent` }
  })()

  const serviceSummary = [
    sessionService.guests
      ? `${sessionService.guests} ${sessionService.guests === 1 ? 'guest' : 'guests'}`
      : 'Guests not set',
    sessionService.waiterName ? `Waiter: ${sessionService.waiterName}` : 'No waiter',
  ].join(' · ')

  // The next thing to press, in words — so a greyed button is never the only
  // explanation of why nothing happens. Only ever names a button this person
  // HAS: kitchen staff (orders view only) were told to "press Send KOT" over an
  // action bar with nothing in it.
  const viewOnlyHint = 'View only. Taking orders and payments needs a front-desk role.'
  const nextStepHint = (() => {
    if (pickingTable) {
      return cartItems.length > 0
        ? 'Tap a table to put these dishes on it.'
        : 'Pick a table, or seat a walk-in, to start.'
    }
    if (counterMode) return null
    if (!canTakeOrders && !canTakeMoney) return viewOnlyHint
    if (cartItems.length > 0) {
      return canTakeOrders
        ? `Save puts these on Round ${nextRound}. Send KOT then sends it to the kitchen.`
        : null
    }
    if (sessionRounds.length === 0) {
      return canTakeOrders ? 'Tap dishes to start Round 1.' : 'No rounds on this table yet.'
    }
    if (selectedRound && !selectedSent) {
      return canTakeOrders
        ? `Round ${selectedRound.round} is saved but not in the kitchen yet. Press Send KOT to send it.`
        : `Round ${selectedRound.round} is saved but not in the kitchen yet.`
    }
    if (billPrintedAt) {
      return canTakeMoney
        ? 'Bill printed. Settle when the guest pays.'
        : 'Bill printed. A cashier settles it when the guest pays.'
    }
    return canTakeOrders
      ? 'Add dishes for another round, or print the bill when the guest asks.'
      : 'Print the bill when the guest asks, then settle.'
  })()

  const dineActionCount = [
    canTakeOrders, canTakeOrders, canTakeOrders || canTakeMoney, canTakeMoney,
  ].filter(Boolean).length || 1

  const expectedModeId = paymentModes.some((m) => (m.id || m.Id) === payModeId)
    ? payModeId
    : (paymentModes[0] ? (paymentModes[0].id || paymentModes[0].Id) : null)
  const showPayModes = canTakeMoney && !settleOpen && paymentModes.length > 1
    && (sessionRounds.length > 0 || (counterMode && cartItems.length > 0))

  // Counter sales rung up but never paid for. They used to be reachable only
  // from the full-screen floor plan; now they are listed where a takeaway is
  // taken, and counted on the Takeaway switch so a dine-in cashier sees them.
  const unpaidCounterOrders = activeOrders
    .filter((o) => !(o.TableId || o.tableId))
    .filter((o) => !/closed|settled|cancelled/i.test(String(o.Status || o.status || '')))
    .sort((a, b) => new Date(b.CreatedOn || 0) - new Date(a.CreatedOn || 0))

  const showBoard = !counterMode && tables.length > 0
  // Open, the board fills column 2 and the dishes wait behind it: while a
  // table is being picked (unless the dishes were asked for first), or when
  // "All tables" reopens it beside a table being served.
  const boardFull = showBoard && (pickingTable ? !dishesFirst : boardOpen)
  const toggleBoard = (open) => {
    setBoardOpen(open)
    if (open) setDishesFirst(false)
  }

  // ── The phone's bottom bar ─────────────────────────────────────────────────
  // On a phone the order panel is a sheet. This bar is always in reach: what is
  // waiting, for which table, and the button that brings the sheet up. Hidden
  // on wider screens by CSS.
  const cartCount = cartItems.reduce((n, c) => n + c.qty, 0)
  const itemsLabel = `${cartCount} ${cartCount === 1 ? 'item' : 'items'}`
  const barTitle = (() => {
    if (pickingTable) return cartCount > 0 ? `${itemsLabel} · ₹${money(grandTotal)}` : 'Dine-in'
    if (counterMode) return cartCount > 0 ? `${itemsLabel} · ₹${money(grandTotal)}` : 'Takeaway'
    return `${selectedTableName} · Round ${nextRound}${cartCount > 0 ? ` · ${itemsLabel}` : ''}`
  })()
  const barDetail = (() => {
    if (pickingTable) return 'No table yet'
    if (counterMode) return roundPill.label
    if (cartCount > 0) {
      return `₹${money(grandTotal)} to save · table ₹${money(sessionSummary.total + grandTotal)}`
    }
    return sessionRounds.length > 0 ? `Table ₹${money(sessionSummary.total)}` : roundPill.label
  })()

  return (
    <div className="fd-billing" ref={billingRef}>
      {/* ONE layout for dine-in and takeaway, in three columns: diet and
          categories · search, tables, dishes · the order. Switching between
          the two never moves the categories, the search or the order panel;
          only column 2 changes — the table board while one is being picked,
          the dishes once it is. */}
      <div className={`fd-billing-layout${showRail ? ' has-rail' : ''}${boardFull ? ' is-board-full' : ''}`}>
        {/* COLUMN 1: DIET AND CATEGORIES, top to bottom, the way every Indian
            till lays them out. Nothing sits above it, so opening the table
            board can never push it down — it used to span this column and cut
            the rail to a sliver. Diet is pinned at the top: it is a short,
            fixed list that re-counts the categories under it, and at the foot
            of twenty categories it scrolled out of reach. Only the categories
            scroll. On a phone the column narrows to 104px beside the dishes. */}
        {showRail && (
          <nav className="fd-cat-rail" aria-label="Menu sections" onClickCapture={showDishes}>
            <DietChips filters={menuFilters} menu={menu} className="is-rail" />
            <CategoryChips filters={menuFilters} className="is-rail" />
          </nav>
        )}

        {/* COLUMN 2: search, then tables, then dishes. The search heads the
            column it searches rather than spanning the categories and the
            order panel as well. */}
        <div className="fd-till-main">
          {/* ONE toolbar for the whole till: find a dish, how it is being sold,
              who it is for, and the time the menu is being read against. It
              replaces a page heading, a card heading and a clock that each took a
              row of their own above the menu. */}
          <div className="fd-till-bar">
            <input
              ref={searchRef}
              type="search"
              className="fd-till-search"
              placeholder="Search dishes, cuisines, courses..."
              aria-label="Search the menu"
              title="Search the menu (F2)"
              value={menuFilters.state.query}
              onChange={(e) => { menuFilters.setQuery(e.target.value); if (e.target.value) showDishes() }}
            />

            {/* How this order is being sold. Both open the same screen; only the
                order panel differs — a table for dine-in, the counter for takeaway.
                Unpaid counter sales are counted on Takeaway so a cashier serving
                tables still sees money waiting at the counter. */}
            <div className="fd-seg" role="group" aria-label="Order type">
              <button
                type="button"
                aria-pressed={!counterMode}
                className={!counterMode ? 'is-on' : ''}
                onClick={() => { if (counterMode) handleTableChange('') }}
                title="Dine-in (F4 picks a table)"
              >
                Dine-in
              </button>
              <button
                type="button"
                aria-pressed={counterMode}
                aria-label={`Counter takeaway${unpaidCounterOrders.length ? `, ${unpaidCounterOrders.length} unpaid` : ''}`}
                className={counterMode ? 'is-on' : ''}
                onClick={() => { if (!counterMode) handlePickCounter() }}
              >
                Takeaway
                {unpaidCounterOrders.length > 0 && (
                  <span className="fd-seg-count" aria-hidden="true">{unpaidCounterOrders.length}</span>
                )}
              </button>
            </div>

            {/* Which table is being served is said by the table board below, so
                the toolbar no longer repeats it. */}

            <span className="fd-till-tail">
              {/* The till's clock. The menu depends on the time — a greyed card
                  and "Opens 07:00" have nothing to be read against without it.
                  Local to this device: a till standing in the outlet reads the
                  outlet's time. */}
              <span className="fd-menu-clock" title="Used by the kitchen schedule">
                {clockLabel}
              </span>
              <PrinterButton />
            </span>
          </div>

          {/* THE TABLE BOARD, under the search: table first, then dishes. Open
              in step 1 it fills this column — every floor, with how many tables
              are free, occupied, waiting on a bill or reserved — and the dishes
              wait behind it. Folded to one row once a table is being served, so
              the menu gets the room back. */}
          {showBoard && (
            <div className="fd-tboard-wrap">
              <TableBoard
                info={boardInfo}
                floors={floors}
                selectedTableId={selectedTable}
                open={boardFull}
                onToggle={toggleBoard}
                fill={boardFull}
                onAddDishes={pickingTable ? showDishes : null}
                onPick={pickFromBoard}
                suggestId={pickingTable ? walkInSuggestion?.table.id : null}
                suggestGuests={walkInGuests}
                findRef={boardFindRef}
              />
            </div>
          )}
          <div className="fd-menu-panel">
            {/* What else the search matched, the filters in force, and tags —
                the search box itself is in the toolbar, the rest in the rail. */}
            <MenuFilterBar filters={menuFilters} menu={menu} hideSearch hideCategories hideDiets />

            {filteredMenu.length === 0 ? (
              <div className="fd-empty">
                {menuFiltered ? 'Nothing matches these filters.' : 'No menu items found.'}
                {/* The way out is offered here rather than left to be hunted for:
                    an empty grid with three filters on is otherwise a puzzle. */}
                {menuFiltered && (
                  <div className="fd-empty-action">
                    <button
                      type="button"
                      className="fd-link-btn"
                      onClick={menuFilters.clear}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="fd-menu-grid">
                {filteredMenu.map((meta) => {
                  const id = meta.id || meta.Id
                  const name = itemName(meta, itemDetails[meta.ItemDetailId])
                  const price = itemPrice(meta)
                  const isVeg = meta.FoodTypeIsVeg === 1 || meta.FoodTypeIsVeg === true
                  // Outside its section's trading hours: still ON the grid and
                  // still findable, but not orderable. Hiding it would leave the
                  // cashier hunting for a dish that is simply not shown, unable
                  // to tell "we do not sell it" from "not right now".
                  const onMenu = isAvailable(meta)
                  // Turned off in Menu Master — which beats the section's hours,
                  // so it reads differently from a dish whose section is shut.
                  const onSale = isOnSale(meta)
                  const backAt = openLabel(meta)
                  const tags = effectiveTags(meta)
                  // Today's portion count, where the dish keeps one. `left` is
                  // null for an untracked dish, which is most of the menu.
                  const left = remainingOf(meta)
                  const refuse = () => {
                    if (!onSale) {
                      toast.info(`${name} is not on sale. Turn it on in Menu Master.`)
                    } else if (isSoldOut(meta)) {
                      toast.info(`${name} is sold out. Add more under Today's Counts.`)
                    } else if (isUnsetToday(meta)) {
                      toast.info(`${name} has no count for today. Set one under Today's Counts.`)
                    } else {
                      toast.info(`${name} is off the menu right now${backAt ? ` — ${backAt.toLowerCase()}` : ''}.`)
                    }
                  }
                  // How many of this dish are already in the cart, across every
                  // line it is on (one plain, one "less spicy" — still two).
                  const inCart = cartQtyByMeta[id] || 0
                  const excl = itemTaxRate(meta) > 0 && !meta?.TaxBreakdown?.isTaxIncluded
                  return (
                    <div
                      key={id}
                      className={`fd-menu-item-card${onMenu ? '' : ' is-unavailable'}${onSale ? '' : ' is-off'}${inCart ? ' in-cart' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-disabled={!onMenu}
                      // A real name, rather than whatever the card's text nodes
                      // concatenate to. Availability belongs in it: aria-disabled
                      // says a control is inert, not why.
                      aria-label={`${name || 'Unnamed item'}, ₹${money(price)}${inCart ? `, ${inCart} in this order` : ''}${onMenu ? '' : `, ${backAt}`}`}
                      onClick={() => (onMenu ? handleMenuClick(meta) : refuse())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (onMenu) handleMenuClick(meta); else refuse()
                        }
                      }}
                    >
                      {inCart > 0 && <span className="fd-tile-qty" aria-hidden="true">{inCart}</span>}
                      {/* The FSSAI square: green dot veg, red triangle non-veg.
                          Staff read the mark, not the word, and it costs a corner
                          rather than a line. The food type is its tooltip. */}
                      {meta.FoodTypeName && (
                        <span
                          className={`fd-diet-mark ${isVeg ? 'is-veg' : 'is-nonveg'}`}
                          title={meta.FoodTypeName}
                          aria-hidden="true"
                        />
                      )}
                      <div className="item-name">{name || '(unnamed)'}</div>
                      {price > 0 && (
                        <div className="item-price">
                          ₹{money(price)}
                          {/* Only a price that GROWS at the till is flagged. An
                              inclusive price is what the guest pays, so it needs
                              no label; the tax shows once, in the order totals. */}
                          {excl && (
                            <span className="tax-flag excl">+ {itemTaxRate(meta)}% tax</span>
                          )}
                        </div>
                      )}
                      {/* ONE status line. Unavailable says why (sold out, no count
                          today, off sale, opens later); otherwise a counted dish
                          says how many are left. Two lines for one fact read as
                          two problems. */}
                      {!onMenu && backAt ? (
                        <div className={`fd-item-window${onSale ? '' : ' is-off'}${isSoldOut(meta) ? ' is-out' : ''}`}>
                          {backAt}
                        </div>
                      ) : (onMenu && left !== null && (
                        <div className={`fd-item-left${left > 0 && left <= 3 ? ' is-low' : ''}`}>
                          {left} left
                        </div>
                      ))}
                      {tags.length > 0 && (
                        <div className="fd-item-tags">
                          {tags.map((t) => (
                            <span
                              key={t.id}
                              className={`fd-item-tag${t.from === 'category' ? ' is-inherited' : ''}`}
                              title={t.from === 'category'
                                ? `From ${categoryNameOf(meta)}`
                                : 'Set on this dish'}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Says whether the next tap opens a sheet, and whether it
                          can be dismissed. A required group changes the wording:
                          "Choices required" warns before the tap, which is
                          cheaper than a disabled button after it. */}
                      {onMenu && (() => {
                        const groups = addonGroupsFor(meta)
                        if (variantsFor(meta).length === 0 && groups.length === 0) return null
                        const required = groups.some((g) => g.minSelection > 0)
                        return (
                          <div className={`item-has-options${required ? ' is-required' : ''}`}>
                            {required ? 'Choices required' : 'Options available'}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart / order panel — the till's working surface. Scrolls internally
            so the totals and actions stay pinned no matter how long the order
            gets. */}
        <div className={`fd-cart-panel${sheetOpen ? ' is-sheet-open' : ''}`} ref={cartRef}>
          {/* WHO AND WHERE, pinned above the scroll: the table, where its
              order stands, and the guests and waiter on it. Everything a
              Petpooja order header answers before the first line. */}
          <div className="fd-cart-head">
            <div className="fd-cart-head-top">
              <strong className="fd-cart-head-name">
                {pickingTable
                  ? 'No table yet'
                  : (counterMode ? 'Counter' : `Table ${selectedTableName}`)}
              </strong>
              <span className={`fd-round-pill ${roundPill.tone}`}>{roundPill.label}</span>
              {/* Phone only (CSS): the sheet's way down. */}
              <button
                type="button"
                className="fd-sheet-close"
                onClick={() => setSheetOpen(false)}
                aria-label="Close the order panel"
              >
                ✕
              </button>
            </div>
            {/* Dishes tapped before a table was picked. Named, with their
                value, so they cannot ride onto a table unnoticed. */}
            {pickingTable && cartItems.length > 0 && (
              <div className="fd-waiting" role="status">
                <span>
                  {cartCount} {cartCount === 1 ? 'dish' : 'dishes'} waiting for a table
                </span>
                <span className="fd-waiting-amt">₹{money(grandTotal)}</span>
                <button
                  type="button"
                  className="fd-link-btn"
                  onClick={() => { setCartItems([]); resetKitchenNotes() }}
                >
                  Clear
                </button>
              </div>
            )}
            {counterMode && (
              <div className="fd-cart-head-meta">Takeaway · pay first, token on payment</div>
            )}
            {selectedTable && !serviceEditOpen && (
              <div className="fd-cart-head-meta">
                <span>Dine-in</span>
                {canTakeOrders ? (
                  <button
                    type="button"
                    className="fd-head-field"
                    onClick={() => setServiceEditOpen(true)}
                    aria-label={`Guests and waiter: ${serviceSummary}. Change`}
                  >
                    {serviceSummary}
                    <span className="fd-head-field-edit" aria-hidden="true">Edit</span>
                  </button>
                ) : (
                  <span>{serviceSummary}</span>
                )}
              </div>
            )}
            {selectedTable && serviceEditOpen && (
              <TableServiceEditor
                guests={sessionService.guests}
                waiterId={sessionService.waiterId}
                waiterName={sessionService.waiterName}
                waiters={waiters}
                // A fresh table has no cart or round to say which outlet it is
                // at yet; the table itself does.
                branchId={activeBranchId || selectedTableRow?.BranchDetailId || null}
                capacity={Number(selectedTableRow?.Capacity || selectedTableRow?.capacity) || null}
                busy={serviceSaving}
                onSave={saveServiceDetails}
                onCancel={() => setServiceEditOpen(false)}
              />
            )}
          </div>

          <div className="fd-cart-scroll">
          {pickingTable ? (
            <TableStartPanel
              info={boardInfo}
              floors={floors}
              guests={walkInGuests}
              onGuests={setWalkInGuests}
              onSeat={seatWalkIn}
              onPick={pickFromBoard}
              onTakeaway={handlePickCounter}
            />
          ) : (
          <>

          {/* Resuming an occupied table is a state change worth announcing —
              the items below are someone else's order, not a fresh one. */}
          {selectedTable && sessionLoading && (
            <div className="fd-session-loading" role="status">Loading this table's order…</div>
          )}
          {selectedTable && !sessionLoading && sessionRounds.length > 0 && (
            <div className="fd-session-resumed" role="status">
              Resuming a running order — {sessionRounds.length}
              {sessionRounds.length === 1 ? ' round' : ' rounds'} already placed.
              New items start Round {sessionRounds.length + 1}.
            </div>
          )}

          {/* A counter order that has been placed but not yet paid for. Shown
              so "Resume payment" has something to point at — otherwise the cart
              is empty and the screen looks like nothing happened. */}
          {counterMode && sessionRounds.length > 0 && (
            <div className="fd-session-panel">
              <div className="fd-session-resumed" role="status">
                Order placed and sent to the kitchen — waiting on payment.
              </div>
              <BillSummary rounds={sessionRounds} title="Counter order" />
            </div>
          )}

          {/* Active session for the selected table (filtered by table) */}
          {selectedTable && (
            sessionRounds.length > 0 ? (
              <div className="fd-session-panel">
                <div className="fd-cart-table-selector">
                  <label>Active Order Round</label>
                  <select
                    value={selectedOrderId || ''}
                    onChange={(e) => setSelectedOrderId(e.target.value || null)}
                  >
                    {sessionRounds.map((r) => (
                      <option key={r.orderId} value={r.orderId}>
                        Round {r.round} — {r.orderNo}{r.time ? ` (${formatRoundTime(r.time)})` : ''}{isRoundSent(r) ? ' · in kitchen' : ' · not sent'}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Each round shows its number + order no. with a "KOT fired"
                    badge and a Delete button inline (delete works even after the
                    KOT fired — customer changed the order). */}
                <div className="fd-session-rounds">
                  <RoundsTimeline
                    rounds={sessionRounds}
                    showPricing
                    onDeleteRound={(r) => setDeleteTarget(r)}
                    kotStatusByOrder={kotStatusByOrder}
                  />
                </div>
                {/* Whole-session bill: per-round totals, item-wise GST and the
                    grand total with its CGST/SGST breakup. */}
                <BillSummary rounds={sessionRounds} />
              </div>
            ) : null
          )}

          {/* Counter sales rung up and not paid for, one tap from being settled.
              Shown while no sale is open, so they never sit under a cart being
              built for the next customer. */}
          {counterMode && !counterOrderId && cartItems.length === 0 && unpaidCounterOrders.length > 0 && (
            <section className="fd-unpaid" aria-label="Unpaid counter sales">
              <h4 className="fd-tpick-sect">
                <span>Unpaid counter sales</span>
                <em>{unpaidCounterOrders.length}</em>
              </h4>
              <div className="fd-unpaid-list">
                {unpaidCounterOrders.map((o) => {
                  const id = o.Id || o.id
                  const no = o.OrderNo || o.orderNo || 'Order'
                  const status = String(o.Status || o.status || 'open').toLowerCase()
                  const placed = formatRoundTime(o.CreatedOn)
                  return (
                    <button
                      type="button"
                      key={id}
                      className="fd-unpaid-row"
                      onClick={() => handleResumeCounter(id)}
                      aria-label={`${no}, takeaway, ${status}, ₹${money(o.Total)} unpaid${
                        placed ? `, placed ${placed}` : ''
                      }. Open it to take payment.`}
                    >
                      <span className="no">{no}</span>
                      <span className="st">{status === 'fired' ? 'In kitchen' : 'Unpaid'}{placed ? ` · ${placed}` : ''}</span>
                      <span className="amt">₹{money(o.Total)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Who this is for. Above the cart because it is asked at the start
              of an order, and skippable because a queue must never wait on it. */}
          <CustomerPicker value={customer} onChange={setCustomer} />

          {/* Cart items */}
          <div className="fd-cart-items">
            {cartItems.length === 0 ? (
              <div className="fd-cart-empty">Tap menu items to add</div>
            ) : cartItems.map((c) => (
              <React.Fragment key={c.lineKey}>
              <div className="fd-cart-row">
                <span className="ci-name">
                  {c.name || '(item)'}
                  {/* Chosen options and what each added, so the line price is
                      explainable rather than a mystery total — and the note the
                      kitchen will get. Same display as every other screen. */}
                  <LineOptions line={c} />
                  {c.isTaxIncluded && Number(c.taxPct) > 0 && <span className="tax-flag incl">incl. tax</span>}
                  {/* The free line is DISCOUNTED, never removed — the kitchen
                      still made it and the stock still moved. */}
                  {offerByLine[c.lineKey] && (
                    <span className="ci-offer">
                      🎁 {offerByLine[c.lineKey].offerName}
                    </span>
                  )}
                  {/* A plain dish never opens the customise sheet, so its note is
                      added here — and any dish's note can be changed here. Inside
                      the line, so it cannot be read as the next dish's. */}
                  <button
                    type="button"
                    className="ci-note-btn"
                    onClick={() => setNoteLine(noteLine === c.lineKey ? null : c.lineKey)}
                    aria-expanded={noteLine === c.lineKey}
                  >
                    <NoteIcon size={11} />
                    {c.note ? 'Edit kitchen note' : 'Add kitchen note'}
                    <span className="fd-sr-only"> for {c.name || 'this dish'}</span>
                  </button>
                </span>
                <div className="ci-qty-btns">
                  <button onClick={() => changeQty(c.lineKey, -1)}>−</button>
                  <span className="ci-qty">{c.qty}</span>
                  <button onClick={() => changeQty(c.lineKey, +1)}>+</button>
                </div>
                <span className="ci-price">
                  {offerByLine[c.lineKey] ? (
                    <>
                      <span className="ci-was">₹{money(c.price * c.qty)}</span>
                      <strong className="ci-now">
                        ₹{money((c.price * c.qty) - offerByLine[c.lineKey].amount)}
                      </strong>
                    </>
                  ) : `₹${money(c.price * c.qty)}`}
                </span>
              </div>
              {noteLine === c.lineKey && (
                <div className="fd-cart-row-editor">
                  <div className="fd-cart-row-editor-head">
                    <span><NoteIcon size={13} />Note for {c.name || 'this dish'}</span>
                    <span className="fd-cart-row-editor-actions">
                      {c.note && (
                        <button
                          type="button"
                          className="fd-link-btn"
                          onClick={() => { setLineNote(c.lineKey, ''); setNoteLine(null) }}
                        >
                          Remove
                        </button>
                      )}
                      <button type="button" className="fd-link-btn" onClick={() => setNoteLine(null)}>
                        Done
                      </button>
                    </span>
                  </div>
                  <KitchenNoteEditor
                    value={c.note || ''}
                    presets={notePresets}
                    onChange={(note) => setLineNote(c.lineKey, note)}
                    label={`Note for ${c.name || 'this dish'}`}
                    compact
                  />
                </div>
              )}
              </React.Fragment>
            ))}
          </div>

          {/* The note for the whole round — "serve starters first", "pack sauces
              separately" — and, for a takeaway, whether to pack cutlery. Shown
              once there is something to send it with. */}
          {cartItems.length > 0 && (
            <div className="fd-order-note">
              <div className="fd-order-note-head">
                <label htmlFor="fd-order-note">
                  Note for the kitchen · {counterMode ? 'whole order' : 'this round'}
                </label>
                <span>{orderNote.length}/{ORDER_NOTE_MAX}</span>
              </div>
              <textarea
                id="fd-order-note"
                rows={2}
                value={orderNote}
                maxLength={ORDER_NOTE_MAX}
                placeholder="e.g. Serve starters first, pack sauces separately"
                onChange={(e) => setOrderNote(e.target.value)}
              />
              {counterMode && (
                <label className="fd-toggle-row">
                  <span>
                    No cutlery
                    <small>Prints boxed on the kitchen ticket for whoever packs the bag.</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="fd-switch"
                    checked={noCutlery}
                    onChange={(e) => setNoCutlery(e.target.checked)}
                  />
                </label>
              )}
            </div>
          )}

          {/* Totals — tax and grand total come from the server quote, so the
              till always agrees with the bill that gets raised. */}
          {cartItems.length > 0 && (
            <div className="fd-cart-totals">
              {!gstOff && (
                <div className="total-row"><span>Subtotal</span><span>₹{money(subTotal)}</span></div>
              )}

              {/* Named, not just netted: "−₹25" tells a cashier nothing when a
                  customer asks why the total moved. */}
              {(cartOffers?.applied || []).map((a) => (
                <div className="total-row offer" key={a.offerId}>
                  <span>🎁 {a.campaignName || a.name}</span>
                  <span>−₹{money(a.discountAmount)}</span>
                </div>
              ))}

              {/* One row per tax component (CGST / SGST / …) — this is the
                  invoice footer, and it sums exactly to the Tax row. */}
              {!gstOff && taxByComponent.map((c) => (
                <div className="total-row tax-component" key={c.name || c.id}>
                  <span>{c.name}{c.rate ? ` @ ${c.rate}%` : ''}</span>
                  <span>₹{money(c.amount)}</span>
                </div>
              ))}

              {!gstOff && (
                <div className="total-row">
                  <span>Tax{quoting ? ' …' : ''}</span>
                  <span>₹{money(taxAmount)}</span>
                </div>
              )}
              <div className="total-row grand"><span>Total</span><span>₹{money(grandTotal)}</span></div>

              {/* The saved order still gets correct server-computed tax, so this
                  total is the one that is wrong — say so rather than letting the
                  cashier quote a figure the bill will not match. */}
              {quoteFailed && !quoting && (
                <div className="total-row tax-unavailable">
                  Tax could not be calculated — this total is incomplete. The bill
                  will show the correct amount.
                </div>
              )}
            </div>
          )}

          </>
          )}
          </div>{/* /fd-cart-scroll */}

          {/* Actions are PINNED below the scroll area and ranked, rather than
              four identical bars. Four equal buttons make the cashier read all
              of them every time; one obvious next step and a row of follow-ups
              can be hit without looking. */}
          <div className="fd-cart-actions">
            {/* HOW THEY WILL PAY, chosen before Settle so the payment sheet
                opens on it — Petpooja's Cash / Card / UPI row. The outlet's own
                methods, nothing else. Hidden while that sheet is open: it has
                the same choice, and two sets of the same radios is one too
                many. */}
            {showPayModes && (
              <div className="fd-paymode-row" role="radiogroup" aria-label="Expected payment method">
                {paymentModes.map((m) => {
                  const mid = m.id || m.Id
                  const on = expectedModeId === mid
                  return (
                    <label key={mid} className={`fd-paymode${on ? ' is-on' : ''}`}>
                      <input
                        type="radio"
                        name="fd-expected-paymode"
                        checked={on}
                        onChange={() => setPayModeId(mid)}
                      />
                      {m.Type || m.type}
                    </label>
                  )
                })}
              </div>
            )}

            {/* Counter service collapses order → kitchen → payment into one
                press. There is no second visit to add a round to, and the food
                is being made now, so nothing is left for the cashier to
                remember. Dine-in keeps its three deliberate steps. */}
            {counterMode ? (
              <>
                {/* One press covers order, kitchen and payment, so it needs
                    both authorities — there is no half of it to offer. */}
                {canTakeOrders && canTakeMoney ? (
                  <button
                    className="fd-btn fd-btn-success fd-btn-lg"
                    onClick={handleCounterOrder}
                    disabled={counterBusy || cartItems.length === 0}
                  >
                    {counterBusy ? 'Placing…' : 'Place & Pay'}
                  </button>
                ) : (
                  <p className="fd-cart-note">
                    Counter sales need permission to take both orders and payments.
                  </p>
                )}
                {sessionRounds.length > 0 && (
                  <div className="fd-cart-actions-row">
                    {/* The customer walked off mid-payment, or the modal was
                        closed by accident: the order is still there and can be
                        settled rather than stranded. */}
                    {canTakeMoney && (
                      <button
                        className="fd-btn fd-btn-outline"
                        onClick={() => setSettleOpen(true)}
                      >
                        Resume payment
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Four steps, left to right, in the order a table goes through
                    them: save the round, send it to the kitchen, print the bill
                    for the guest, settle. Short labels: a second line inside a
                    76px button was cut to "Before pay…". Which round each acts
                    on, and why one is off, is the sentence under the row. */}
                <div
                  className="fd-cart-actions-grid"
                  style={{ gridTemplateColumns: `repeat(${dineActionCount}, minmax(0, 1fr))` }}
                >
                  {canTakeOrders && (
                    <button
                      className="fd-btn fd-btn-primary fd-act"
                      onClick={handleAddRound}
                      disabled={!selectedTable || cartItems.length === 0}
                      aria-label={`Save Round ${sessionRounds.length + 1}`}
                      title="Saves the cart as a round. It is not sent to the kitchen until you press KOT."
                    >
                      <span>Save</span>
                    </button>
                  )}
                  {/* Send-once on the server, so this stays enabled: pressing it
                      on a round that is already cooking reports that rather than
                      duplicating the ticket. */}
                  {canTakeOrders && (
                    <button
                      className="fd-btn fd-btn-warning fd-act"
                      onClick={handleSendKot}
                      disabled={!selectedOrderId}
                      aria-label={selectedSent ? 'Sent to the kitchen' : 'Send KOT'}
                      title={selectedSent
                        ? 'This round is already in the kitchen'
                        : 'Send this round to the kitchen'}
                    >
                      <span>{selectedSent ? 'Sent ✓' : 'Send KOT'}</span>
                    </button>
                  )}
                  {(canTakeOrders || canTakeMoney) && (
                    <button
                      className="fd-btn fd-btn-outline fd-act"
                      onClick={printProvisionalBill}
                      disabled={sessionRounds.length === 0 || billPrinting}
                      aria-label="Print bill"
                      title="Prints the bill for the guest to check. The tax invoice is issued when it is settled."
                    >
                      <span>{billPrinting ? 'Printing…' : (billPrintedAt ? 'Print again' : 'Print bill')}</span>
                    </button>
                  )}
                  {canTakeMoney && (
                    <button
                      className="fd-btn fd-btn-success fd-act"
                      onClick={() => setSettleOpen(true)}
                      disabled={sessionRounds.length === 0}
                      aria-label="Settle bill"
                    >
                      <span>Settle</span>
                      {sessionRounds.length > 0 && <small>{`₹${money(sessionSummary.total)}`}</small>}
                    </button>
                  )}
                </div>
                {nextStepHint && <p className="fd-cart-hint">{nextStepHint}</p>}
              </>
            )}

            {/* Rarely used and never urgent, so it stays out of the way of the
                two buttons a cashier presses all shift. */}
            <div className="fd-cart-actions-minor">
              {/* The safety net: what the campaigns would do to this cart,
                  before anybody takes money. */}
              {!counterMode && cartItems.length > 0 && (
                <button
                  type="button"
                  className="fd-link-btn"
                  onClick={checkOffers}
                  disabled={checkingOffers}
                >
                  {checkingOffers ? 'Checking…' : '🎁 Check offers'}
                </button>
              )}
              {/* Transferring needs a table to transfer between. */}
              {selectedTable && canTakeOrders && (
                <button
                  type="button"
                  className="fd-link-btn"
                  onClick={() => setTransferOpen(true)}
                  disabled={sessionRounds.length === 0}
                >
                  Transfer table
                </button>
              )}
              {cartItems.length > 0 && (
                <button type="button" className="fd-link-btn" onClick={() => { setCartItems([]); resetKitchenNotes() }}>
                  Clear cart
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Phone only (CSS): the bar that brings the order panel up as a sheet,
          and the scrim behind it. */}
      {sheetOpen && (
        <div className="fd-sheet-scrim" aria-hidden="true" onClick={() => setSheetOpen(false)} />
      )}
      {!sheetOpen && (
        <div className="fd-cart-jump">
          <span className="fd-cart-jump-text">
            <b>{barTitle}</b>
            <small>{barDetail}</small>
          </span>
          <button type="button" onClick={() => setSheetOpen(true)}>
            {pickingTable ? 'Seat walk-in' : 'View order'}
          </button>
        </div>
      )}

      {/* Customise sheet — the one place a dish's choices are made.
          Opens when the item offers variants, add-on groups, or both. Sections
          are drawn in a fixed order (Options, then groups in their configured
          order) so the same control is always in the same place, and a section
          with nothing in it is not drawn at all. */}
      {customise && (() => {
        const meta = customise.meta
        const offeredVariants = variantsFor(meta)
        const groups = addonGroupsFor(meta)
        const pickedVariants = offeredVariants.filter(
          (v) => customise.variantIds.includes(v.id || v.Id),
        )
        const pickedAddons = addonsByIds(customise.addonIds)
        const base = itemPrice(meta)
        const variantSum = pickedVariants
          .reduce((s, v) => s + (Number(v.Price ?? v.price) || 0), 0)
        const addonSum = pickedAddons.reduce((s, a) => s + a.price, 0)
        const total = base + variantSum + addonSum
        const blocker = customiseBlocker(meta, customise.addonIds)
        // Skip is only honest while nothing is compulsory. With a required
        // group on the dish it would produce a line the server refuses, so it
        // is not offered rather than offered and then rejected.
        const skippable = !groups.some((g) => g.minSelection > 0)

        const toggleVariant = (vid) => setCustomise((prev) => ({
          ...prev,
          variantIds: prev.variantIds.includes(vid)
            ? prev.variantIds.filter((x) => x !== vid)
            : [...prev.variantIds, vid],
        }))

        // A group capped at one behaves as a radio: choosing swaps rather than
        // adds. Anything wider is a checkbox that stops accepting at the cap —
        // silently dropping the earliest pick there would lose a choice the
        // cashier had already confirmed with the guest.
        const toggleAddon = (group, oid) => setCustomise((prev) => {
          const has = prev.addonIds.includes(oid)
          if (has) {
            return { ...prev, addonIds: prev.addonIds.filter((x) => x !== oid) }
          }
          const groupOptionIds = group.options.map((o) => o.id)
          if (group.maxSelection === 1) {
            return {
              ...prev,
              addonIds: [
                ...prev.addonIds.filter((x) => !groupOptionIds.includes(x)),
                oid,
              ],
            }
          }
          const inGroup = prev.addonIds.filter((x) => groupOptionIds.includes(x)).length
          if (group.maxSelection > 0 && inGroup >= group.maxSelection) {
            toast.info(`${group.name}: pick at most ${group.maxSelection}`)
            return prev
          }
          return { ...prev, addonIds: [...prev.addonIds, oid] }
        })

        const commit = (variantsToAdd, addonsToAdd) => {
          // The note goes with the plate whichever button added it — skipping
          // the options is not skipping the instruction.
          addToCart(meta, variantsToAdd, addonsToAdd, customise.note)
          setCustomise(null)
        }

        return (
          <div className="fd-modal-backdrop" role="dialog" aria-label="Customise item">
            <div className="fd-customise-sheet">
              <div className="fd-cust-head">
                <h3>{itemName(meta, itemDetails[meta.ItemDetailId])}</h3>
                <p className="fd-cust-sub">
                  Base ₹{money(base)} · everything added here is taxed with the dish.
                </p>
              </div>

              <div className="fd-cust-body">
                {offeredVariants.length > 0 && (
                  <section className="fd-cust-group has-divider">
                    <header className="fd-cust-group-head">
                      <span className="fd-cust-group-name">Options</span>
                      <span className="fd-cust-rule">Optional</span>
                    </header>
                    {offeredVariants.map((v) => {
                      const vid = v.id || v.Id
                      const price = Number(v.Price ?? v.price) || 0
                      const checked = customise.variantIds.includes(vid)
                      return (
                        <label
                          key={vid}
                          className={`fd-cust-option ${checked ? 'is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleVariant(vid)}
                          />
                          <span className="fd-cust-option-name">{v.Name || v.name}</span>
                          <span className="fd-cust-option-price">
                            {price > 0 ? `+₹${money(price)}` : 'No extra charge'}
                          </span>
                        </label>
                      )
                    })}
                  </section>
                )}

                {groups.map((g) => {
                  const count = g.options.filter(
                    (o) => customise.addonIds.includes(o.id),
                  ).length
                  const required = g.minSelection > 0
                  return (
                    <section className="fd-cust-group" key={g.id}>
                      <header className="fd-cust-group-head">
                        <span className="fd-cust-group-name">{g.name}</span>
                        {/* The rule is SPOKEN, not discovered by tapping a
                            checkbox that refuses. */}
                        {required ? (
                          <span className="fd-cust-rule is-required">
                            Required · pick {g.minSelection === g.maxSelection
                              ? g.minSelection
                              : `${g.minSelection}+`}
                          </span>
                        ) : (
                          <span className="fd-cust-rule">
                            {g.maxSelection > 0
                              ? `${count} of ${g.maxSelection} chosen`
                              : 'Optional'}
                          </span>
                        )}
                      </header>
                      {g.options.map((o) => {
                        const checked = customise.addonIds.includes(o.id)
                        return (
                          <label
                            key={o.id}
                            className={`fd-cust-option ${checked ? 'is-selected' : ''}`}
                          >
                            <input
                              type={g.maxSelection === 1 ? 'radio' : 'checkbox'}
                              name={`addon-group-${g.id}`}
                              checked={checked}
                              onChange={() => toggleAddon(g, o.id)}
                            />
                            <span className="fd-cust-option-name">{o.name}</span>
                            <span className="fd-cust-option-price">
                              {o.price > 0 ? `+₹${money(o.price)}` : 'No extra charge'}
                            </span>
                          </label>
                        )
                      })}
                    </section>
                  )
                })}

                {/* Last: HOW, once the sheet has settled WHAT. Never charged
                    and never blocks Add. */}
                <section className="fd-cust-group is-note">
                  <header className="fd-cust-group-head">
                    <span className="fd-cust-group-name">
                      <NoteIcon size={14} />
                      Note for the kitchen
                    </span>
                    <span className="fd-cust-rule">No charge · goes on the KOT</span>
                  </header>
                  <KitchenNoteEditor
                    value={customise.note || ''}
                    presets={notePresets}
                    onChange={(note) => setCustomise((prev) => (prev ? { ...prev, note } : prev))}
                    label={`Note for ${itemName(meta, itemDetails[meta.ItemDetailId])}`}
                  />
                </section>
              </div>

              <div className="fd-cust-foot">
                {/* The breakdown, not just the total: a guest querying the bill
                    asks about the extras, and the cashier has to be able to
                    read them apart from the portion. */}
                <div className="fd-cust-total">
                  {/* Only drawn once there is something to break down. With
                      nothing ticked it would just restate the total beside
                      itself. */}
                  {(variantSum > 0 || addonSum > 0) && (
                    <span className="fd-cust-total-parts">
                      ₹{money(base)}
                      {variantSum > 0 ? ` + options ₹${money(variantSum)}` : ''}
                      {addonSum > 0 ? ` + extras ₹${money(addonSum)}` : ''}
                    </span>
                  )}
                  <span className="fd-cust-total-value">₹{money(total)}</span>
                </div>

                <div className="fd-cust-actions">
                  <button
                    className="fd-btn fd-btn-success fd-cust-add"
                    disabled={!!blocker}
                    title={blocker || undefined}
                    onClick={() => commit(pickedVariants, pickedAddons)}
                  >
                    {blocker || `Add to Order · ₹${money(total)}`}
                  </button>
                  {skippable && (
                    <button
                      className="fd-btn fd-btn-outline"
                      onClick={() => commit([], [])}
                    >
                      Skip Options
                    </button>
                  )}
                  <button
                    className="fd-btn fd-btn-outline"
                    onClick={() => setCustomise(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Transfer sheet — move items or whole rounds to another table. */}
      <TransferSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={handleTransfer}
        busy={transferBusy}
        sourceTableId={selectedTable}
        sourceTableLabel={(() => {
          const t = tables.find((x) => (x.id || x.Id) === selectedTable)
          if (!t) return 'Table'
          const f = floors.find((x) => (x.id || x.Id) === t.FloorId)
          return `${f ? `${f.Name || f.name} - ` : ''}${t.Name || t.name}`
        })()}
        rounds={sessionRounds}
        activeOrderId={selectedOrderId}
        tables={tables}
        floors={floors}
      />

      {/* Delete round confirmation — allowed even after the KOT has fired. */}
      {deleteTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Delete round">
          <div className="fd-confirm-modal">
            <h3>Delete Round {deleteTarget.round}?</h3>
            <p>
              This removes the whole round
              {deleteTarget.orderNo ? <> (<b>{deleteTarget.orderNo}</b>)</> : null} from the order.
              {isRoundSent(deleteTarget)
                ? ' It is already in the kitchen — its ticket will be pulled from the pass.'
                : ''}
            </p>
            <p className="fd-confirm-sub">Use this when the customer changes their order.</p>
            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={() => setDeleteTarget(null)} disabled={deletingRound}>
                Keep round
              </button>
              <button className="fd-btn fd-btn-danger" onClick={handleDeleteRound} disabled={deletingRound}>
                {deletingRound ? 'Deleting…' : 'Delete round'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Posted-to-ledger confirmation. The invoice number is the
          customer-facing artefact, so it leads. */}
      {/* ── What the campaigns would do ──────────────────────────────────
          Three lists: applied, earned-but-not-taken, and did-not-apply WITH
          THE REASON. A silent "no" is what makes staff stop trusting an offer
          engine and start typing discounts by hand. */}
      {offerCheck && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Offer check">
          <div className="ofc-panel">
            <h3>🎁 Offer check</h3>
            <p className="muted small" style={{ margin: '0 0 14px' }}>
              Every live offer, run against this cart. Nothing has been charged.
            </p>

            {offerCheck.applied.length > 0 && (
              <div className="ofc-group">
                <h4>Applies — {money(offerCheck.totalDiscount)} off</h4>
                {offerCheck.applied.map((a) => (
                  <div className="ofc-row" key={a.offerId}>
                    <span className="ofc-dot ok">✓</span>
                    <span>
                      <strong>{a.name} — {money(a.discountAmount)}</strong>
                      <em>
                        {a.campaignName ? `${a.campaignName} · ` : ''}
                        {a.awards.map((w) => `${w.quantity} × ${w.itemName || 'item'}`).join(', ')}
                      </em>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {offerCheck.earned.length > 0 && (
              <div className="ofc-group">
                <h4>Earned, but not taken</h4>
                {offerCheck.earned.map((a) => (
                  <div className="ofc-row" key={a.offerId}>
                    <span className="ofc-dot add">+</span>
                    <span style={{ flex: 1 }}>
                      <strong>{a.name}</strong>
                      {/* The reward has to be a line before it can be
                          discounted — so the till asks rather than inventing a
                          phantom line the kitchen never sees. */}
                      <em>Qualifies. Add the item to the order to give it.</em>
                      {a.rewardItemId && (
                        <button
                          className="fd-btn fd-btn-success fd-btn-sm"
                          style={{ marginTop: 8 }}
                          onClick={() => addRewardItem(a.rewardItemId)}
                        >
                          Add it
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {offerCheck.skipped.length > 0 && (
              <div className="ofc-group">
                <h4>Did not apply</h4>
                {offerCheck.skipped.map((a) => (
                  <div className="ofc-row" key={a.offerId}>
                    <span className="ofc-dot no">✕</span>
                    <span>
                      <strong>{a.name}</strong>
                      <em>
                        {a.message
                          || (a.shortBy !== undefined && a.shortBy !== null
                            ? `${a.needed !== undefined && a.reason === 'BILL_TOO_SMALL'
                              ? `₹${a.shortBy} more and it qualifies`
                              : `${a.shortBy} more needed`}`
                            : 'Not applicable to this bill')}
                      </em>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {offerCheck.considered === 0 && (
              <p className="muted small">No campaigns are running at this branch right now.</p>
            )}

            {/* A line with no catalogue item behind it matches no trigger, so
                every offer reports "not enough items" at a cart that has
                plenty. Saying THAT beats sending somebody to add another cup
                of tea that will not help either. */}
            {offerCheck.unidentifiedLines > 0 && (
              <div className="ofc-warn" role="alert">
                <strong>
                  {offerCheck.unidentifiedLines} line
                  {offerCheck.unidentifiedLines === 1 ? '' : 's'} could not be matched to a menu item.
                </strong>
                No offer can apply to them. Clear the cart and add the items again.
              </div>
            )}

            <div className="ofc-note">
              <strong>This is a preview, not the authority.</strong> The offers are re-run and
              written when the bill settles, so skipping this check still gives the right bill.
            </div>

            <div className="ofc-actions">
              <button className="fd-btn fd-btn-primary" onClick={() => setOfferCheck(null)}>
                Back to the order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outside #root — printing takes the paper and nothing else. */}
      {job && <Receipt doc={job.doc} format={format} shop={shop} data={job.data} />}

      {settledInvoice && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Bill settled">
          <div className="fd-invoice-modal">
            <div className="fd-invoice-tick">✓</div>
            <h3>{settledInvoice.balanceDue > 0 ? 'Partial payment recorded' : 'Posted to ledger'}</h3>
            {/* The token OUTRANKS the invoice number here. The customer is
                standing at the counter waiting to be told a number; the invoice
                is for the books. Nobody can call a token that was never shown
                to the person taking the money. */}
            {settledInvoice.tokenLabel && (
              <div className="fd-invoice-token">
                <span>Token</span>
                <strong>{settledInvoice.tokenLabel}</strong>
                <em>Tell the customer this number</em>
              </div>
            )}
            {settledInvoice.transactionNo && (
              <div className="fd-invoice-no">
                <span>Invoice</span>
                <strong>{settledInvoice.transactionNo}</strong>
              </div>
            )}
            <div className="fd-invoice-total">₹{money(settledInvoice.total)}</div>
            <ul className="fd-invoice-tenders">
              {settledInvoice.tenders.map((t, i) => (
                <li key={i}>
                  <span>{t.mode}</span>
                  <span>
                    ₹{money(t.amount)}
                    {t.refNo ? <em> · ref {t.refNo}</em> : null}
                  </span>
                </li>
              ))}
            </ul>
            {settledInvoice.balanceDue > 0 && (
              <>
                <div className="fd-settle-warn" role="alert">
                  ₹{money(settledInvoice.balanceDue)} still due
                  {settledInvoice.debtor ? ` from ${settledInvoice.debtor}` : ''}.
                  It stays in Money → Dues until it is collected.
                </div>
                {/* Now — the guest is fetching a second card — or later. */}
                {settledInvoice.logId && (
                  <div className="fd-settle-collect">
                    <button
                      type="button"
                      className="fd-btn fd-btn-success"
                      onClick={() => setCollectNow({
                        Id: settledInvoice.logId,
                        TransactionNo: settledInvoice.transactionNo,
                        GrossAmount: settledInvoice.total,
                        Paid: settledInvoice.paid,
                        Due: settledInvoice.balanceDue,
                        CustomerName: settledInvoice.debtor,
                        BranchId: settledInvoice.branchId,
                        label: settledInvoice.tokenLabel || settledInvoice.tableName || null,
                      })}
                    >
                      Collect ₹{money(settledInvoice.balanceDue)} now
                    </button>
                    <button type="button" className="fd-btn fd-btn-outline" onClick={() => setSettledInvoice(null)}>
                      Collect later
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="fd-invoice-print">
              <button
                className="fd-btn fd-btn-outline"
                disabled={!settledInvoice.logId || printing}
                onClick={printBill}
              >
                {printing ? 'Printing…' : '🧾 Print bill'}
              </button>
              {/* A counter customer walks away holding a number. Telling them
                  "A-14" and printing nothing means the queue runs on memory. */}
              {settledInvoice.tokenLabel && (
                <button className="fd-btn fd-btn-outline" onClick={printToken}>
                  🎫 Print token
                </button>
              )}
              <button className="fd-btn fd-btn-success" onClick={() => setSettledInvoice(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect the rest straight from the confirmation. On success the
          confirmation closes: the bill is settled, or what remains is in Dues. */}
      <CollectFlow
        doc={collectNow}
        onClose={() => setCollectNow(null)}
        onChanged={() => { setSettledInvoice(null); load() }}
      />

      {/* Settle Bill modal */}
      {settleOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
          padding: 16, boxSizing: 'border-box'
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 420, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Settle Bill</h3>

            {/* The full bill being settled: every round, item-wise GST and the
                pre-discount grand total. */}
            <BillSummary rounds={sessionRounds} title="Bill" defaultOpenBreakup />

            <div className="fd-settle-form" style={{ marginTop: 16 }}>
              {/* ── Tenders ────────────────────────────────────────────────
                  One row per way the customer paid. Each becomes a
                  paymentbreakup in the ledger, so a split settlement is
                  recorded rather than flattened into a single "paid". */}
              <div className="fd-tenders">
                <div className="fd-tenders-head">
                  <label>Payments</label>
                  <button
                    type="button" className="fd-link-btn"
                    onClick={() => addTender()}
                    disabled={paymentModes.length === 0}
                  >
                    + Split payment
                  </button>
                </div>

                {paymentModes.length === 0 ? (
                  <div className="fd-tender-empty fd-tender-nomodes" role="alert">
                    No payment methods are switched on for this outlet. Turn one on
                    under <b>Outlet → Payment methods</b>, then reopen Settle.
                  </div>
                ) : tenders.length === 0 ? (
                  <div className="fd-tender-empty">No payment added yet.</div>
                ) : null}

                {/* HOW IT IS PAID, ON THE SCREEN.
                    This was a 90px-wide <select> — every option hidden behind a
                    tap, and 'District Settlement' rendered as 'District S…', so
                    a cashier could not read what they were choosing. Radios put
                    every mode in front of them, and each one names the ACCOUNT
                    it books to: settling a counter sale to a portal tender puts
                    the money in a receivable, not the drawer, and leaves the
                    cash session short with nothing on screen to explain it.

                    Still one radio group PER TENDER, because a bill can be
                    split across several — flattening it to a single choice
                    would quietly remove split settlement. */}
                {tenders.map((t, ti) => (
                  <div className="fd-tender-block" key={t.key}>
                    {tenders.length > 1 && (
                      <div className="fd-tender-block-head">
                        <span>Payment {ti + 1}</span>
                        <button
                          type="button" className="fd-tender-remove"
                          aria-label={`Remove payment ${ti + 1}`}
                          onClick={() => removeTender(t.key)}
                        >×</button>
                      </div>
                    )}

                    <div
                      className="fd-mode-grid"
                      role="radiogroup"
                      aria-label={tenders.length > 1 ? `Payment ${ti + 1} mode` : 'Payment mode'}
                    >
                      {paymentModes.map((m) => {
                        const mid = m.id || m.Id
                        const on = t.paymentModeId === mid
                        return (
                          <label key={mid} className={`fd-mode${on ? ' is-on' : ''}`}>
                            {/* A real radio under the styling, never a div
                                pretending: arrow keys move between them and the
                                choice is announced. */}
                            <input
                              type="radio"
                              name={`tender-mode-${t.key}`}
                              value={mid}
                              checked={on}
                              onChange={() => updateTender(t.key, { paymentModeId: mid })}
                            />
                            <span className="fd-mode-ring" aria-hidden="true" />
                            <span className="fd-mode-text">
                              <span className="fd-mode-name">{m.Type || m.type}</span>
                              {(m.AccountName || m.accountName) && (
                                <span className="fd-mode-acct">{m.AccountName || m.accountName}</span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>

                    <div className="fd-tender-row">
                      <input
                        type="number" min="0" step="0.01"
                        aria-label={tenders.length > 1 ? `Payment ${ti + 1} amount` : 'Amount'}
                        value={t.amount}
                        onChange={(e) => updateTender(t.key, { amount: e.target.value })}
                      />
                      {/* Reference only appears where reconciliation needs it, so
                          the cash path stays two taps. */}
                      {needsRef(t.paymentModeId) && (
                        <input
                          type="text"
                          aria-label="Reference number"
                          placeholder="Ref no."
                          value={t.refNo || ''}
                          onChange={(e) => updateTender(t.key, { refNo: e.target.value })}
                        />
                      )}
                      {tenders.length === 1 && (
                        <button
                          type="button" className="fd-tender-remove"
                          aria-label="Remove payment"
                          onClick={() => removeTender(t.key)}
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Quick tender — the biggest speed win on a real till. */}
                {paymentModes.length > 0 && (
                <div className="fd-quick-tender">
                  <button type="button" onClick={() => { setTenders([]); addTender(payable) }}>
                    Exact ₹{money(payable)}
                  </button>
                  {[500, 1000, 2000]
                    .filter((n) => n > payable)
                    .slice(0, 2)
                    .map((n) => (
                      <button key={n} type="button" onClick={() => { setTenders([]); addTender(n) }}>
                        ₹{n}
                      </button>
                    ))}
                </div>
                )}
              </div>
              <div>
                <div className="fd-discount-head">
                  <label htmlFor="settle-discount">Discount</label>
                  {/* Whole bill or specific dishes. Both can apply at once — the
                      toggle only chooses which controls are on screen — and they
                      are stored and reported separately, because "we discounted
                      this dish" is a decision while "this dish's share of 10%
                      off" is an accounting artefact. */}
                  <div className="fd-discount-mode" role="group" aria-label="Discount scope">
                    <button
                      type="button"
                      className={discountMode === 'bill' ? 'is-active' : ''}
                      aria-pressed={discountMode === 'bill'}
                      onClick={() => setDiscountMode('bill')}
                    >
                      Whole bill
                    </button>
                    <button
                      type="button"
                      className={discountMode === 'item' ? 'is-active' : ''}
                      aria-pressed={discountMode === 'item'}
                      onClick={() => setDiscountMode('item')}
                    >
                      Per item
                    </button>
                  </div>
                </div>

                {discountMode === 'item' && (
                  <div className="fd-item-discounts">
                    {settleLines.length === 0 ? (
                      <div className="fd-tender-empty">No priceable lines to discount.</div>
                    ) : settleLines.map((l) => {
                      const current = lineDiscounts[l.ref] || { type: 'amount', value: '' }
                      // Keep the draft exactly as typed — including a blank
                      // value under a chosen ₹/%. Pricing reads
                      // activeLineDiscounts, which ignores blanks, so an
                      // in-progress row still discounts nothing.
                      const setFor = (patch) => setLineDiscounts((prev) => ({
                        ...prev,
                        [l.ref]: { ...(prev[l.ref] || current), ...patch },
                      }))
                      return (
                        <div className="fd-item-discount-row" key={l.ref}>
                          <span className="fd-item-discount-name">
                            {settleLineLabels[l.ref] || 'Item'}
                            <span className="fd-bill-gst-qty">×{l.quantity}</span>
                          </span>
                          <div className="fd-discount-toggle" role="group" aria-label={`Discount type for ${settleLineLabels[l.ref] || 'item'}`}>
                            <button
                              type="button"
                              className={current.type === 'amount' ? 'is-active' : ''}
                              aria-pressed={current.type === 'amount'}
                              onClick={() => setFor({ type: 'amount' })}
                            >₹</button>
                            <button
                              type="button"
                              className={current.type === 'percent' ? 'is-active' : ''}
                              aria-pressed={current.type === 'percent'}
                              onClick={() => setFor({ type: 'percent' })}
                            >%</button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={current.type === 'percent' ? 100 : undefined}
                            step={current.type === 'percent' ? 1 : 0.01}
                            aria-label={
                              `Discount for ${settleLineLabels[l.ref] || 'item'}`
                              + ` (${current.type === 'percent' ? 'percent' : 'rupees'})`
                            }
                            placeholder={current.type === 'percent' ? '0%' : '0'}
                            value={current.value}
                            onChange={(e) => setFor({ value: e.target.value })}
                          />
                          {/* What it actually took off, from the server quote.
                              A percentage means nothing to a cashier until it
                              is a rupee figure, and this is the only place the
                              two can be checked against each other. */}
                          <span className="fd-item-discount-off">
                            {lineDiscountOff[l.ref] > 0 ? `−₹${money(lineDiscountOff[l.ref])}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Only in bill mode. Two ₹/% toggles on screen at once — one
                    per dish, one for the bill — read as one broken control, and
                    a cashier discounting a single dish would flip the wrong
                    one. A bill discount typed earlier still applies; the note
                    below says so rather than letting it vanish silently. */}
                {discountMode === 'item' && billDiscountAmount > 0 && (
                  <small className="fd-settle-note">
                    A whole-bill discount of −₹{money(billDiscountAmount)} is still applied.
                    Switch to Whole bill to change it.
                  </small>
                )}

                {discountMode === 'bill' && (
                <>
                <div className="fd-discount-field">
                  {/* Choose how the value is read: a flat ₹ amount or a % of the
                      subtotal. The suffix and max adjust to match. */}
                  <div className="fd-discount-toggle" role="group" aria-label="Amount or percent">
                    <button
                      type="button"
                      className={settleDiscountType === 'amount' ? 'is-active' : ''}
                      aria-pressed={settleDiscountType === 'amount'}
                      onClick={() => setSettleDiscountType('amount')}
                    >
                      ₹
                    </button>
                    <button
                      type="button"
                      className={settleDiscountType === 'percent' ? 'is-active' : ''}
                      aria-pressed={settleDiscountType === 'percent'}
                      onClick={() => setSettleDiscountType('percent')}
                    >
                      %
                    </button>
                  </div>
                  <div className="fd-discount-input">
                    <input
                      id="settle-discount"
                      type="number"
                      min="0"
                      max={settleDiscountType === 'percent' ? 100 : undefined}
                      step={settleDiscountType === 'percent' ? 1 : 0.01}
                      value={settleDiscount}
                      onChange={(e) => setSettleDiscount(e.target.value)}
                      placeholder="0"
                    />
                    <span className="fd-discount-suffix">
                      {settleDiscountType === 'percent' ? '%' : '₹'}
                    </span>
                  </div>
                </div>
                <small className="fd-settle-note">
                  {/* The BILL share, not settleTotals.discount — that is the
                      item and bill discounts combined, so quoting it here
                      overstated what the percentage had done. */}
                  {settleDiscountType === 'percent'
                    ? `${Number(settleDiscount) || 0}% of the subtotal = −₹${money(billDiscountAmount)}, applied before tax.`
                    : 'Applied before tax — the discount reduces the taxable amount.'}
                </small>
                </>
                )}
              </div>
            </div>

            {/* Payable — updates live as the discount changes. */}
            <div className="fd-settle-payable">
              <div className="fd-settle-payable-row">
                <span>Subtotal</span><span>₹{money(settleTotals.subTotal)}</span>
              </div>
              {/* Named, the way the cart names them. A campaign discount folded
                  silently into "Discount" is one the cashier cannot explain when
                  the customer asks why the total moved — and cannot spot when it
                  is wrong. */}
              {(settleOffers?.applied || []).map((a) => (
                <div className="fd-settle-payable-row fd-settle-discount fd-settle-payable-sub" key={a.offerId}>
                  <span>🎁 {a.campaignName || a.name}</span>
                  <span>−₹{money(a.discountAmount)}</span>
                </div>
              ))}
              {/* Split out ONLY when both kinds apply. With one kind the split
                  would just restate the total on the row below it, and a
                  cashier reading two identical figures has to work out that
                  they are the same number. */}
              {itemDiscountAmount > 0 && billDiscountAmount > 0 && (
                <>
                  <div className="fd-settle-payable-row fd-settle-discount fd-settle-payable-sub">
                    <span>Item discounts</span><span>−₹{money(itemDiscountAmount)}</span>
                  </div>
                  <div className="fd-settle-payable-row fd-settle-discount fd-settle-payable-sub">
                    <span>Bill discount</span><span>−₹{money(billDiscountAmount)}</span>
                  </div>
                </>
              )}
              {settleTotals.discount > 0 && (
                <div className="fd-settle-payable-row fd-settle-discount">
                  <span>Discount</span><span>−₹{money(settleTotals.discount)}</span>
                </div>
              )}
              {settleQuote?.totals?.taxCharged !== false && (
                <>
                  {settleTotals.taxByComponent.map((c) => (
                    <div className="fd-settle-payable-row fd-settle-payable-sub" key={c.name}>
                      <span>{c.name}{c.rate ? ` @ ${c.rate}%` : ''}</span><span>₹{money(c.amount)}</span>
                    </div>
                  ))}
                  <div className="fd-settle-payable-row">
                    <span>Tax</span><span>₹{money(settleTotals.tax)}</span>
                  </div>
                </>
              )}
              {/* The paise the till cannot hand over. Shown here because the
                  invoice books it as RoundOff, and a cashier who is asked for
                  ₹639.00 on a ₹638.88 bill needs to see where the 12p came
                  from — the alternative is being 12p short and not knowing. */}
              {settleTotals.roundOff !== 0 && (
                <div className="fd-settle-payable-row fd-settle-payable-sub">
                  <span>Round off</span>
                  <span>
                    {settleTotals.roundOff < 0 ? '−' : '+'}₹{money(Math.abs(settleTotals.roundOff))}
                  </span>
                </div>
              )}
              <div className="fd-settle-payable-row fd-settle-payable-grand">
                <span>Amount Payable</span><span>₹{money(settleTotals.payable)}</span>
              </div>
              {/* Balance due is the hero: red while short, green when covered.
                  Cashiers work to this number, so it gets the emphasis. */}
              <div className={`fd-settle-balance ${balanceDue > 0 ? 'is-short' : 'is-ok'}`}>
                <div className="fd-settle-payable-row">
                  <span>Tendered</span><span>₹{money(tendered)}</span>
                </div>
                <div className="fd-settle-payable-row fd-settle-balance-row">
                  <span>{balanceDue > 0 ? 'Balance Due' : changeDue > 0 ? 'Change' : 'Balance Due'}</span>
                  <span>₹{money(balanceDue > 0 ? balanceDue : changeDue)}</span>
                </div>
              </div>
            </div>

            {/* Settling is still allowed — a drink poured at the counter never
                needs a ticket — but a round the kitchen never saw must not slip
                past silently. */}
            {unsentRounds.length > 0 && (
              <div className="fd-settle-warn is-soft" role="status">
                {unsentRounds.length === 1 ? 'Round' : 'Rounds'}{' '}
                {unsentRounds.map((r) => r.round).join(', ')}{' '}
                {unsentRounds.length === 1 ? 'was' : 'were'} never sent to the kitchen.
                Settle anyway if that is intended.
              </div>
            )}

            {/* Say WHY settling is blocked rather than showing a mute button. */}
            {missingRef && (
              <div className="fd-settle-warn" role="alert">
                Enter a reference number for this payment method.
              </div>
            )}
            {balanceDue > 0 && tenders.length > 0 && (
              <div className="fd-settle-warn" role="alert">
                ₹{money(balanceDue)} still due — settling now records a partial payment.
              </div>
            )}
            {/* Who owes the rest. Required, because a balance with no name on
                it cannot be chased — unless a guest is already on the table. */}
            {balanceDue > 0 && tenders.length > 0 && (
              <div className="fd-settle-debtor">
                <div className="fd-settle-debtor-title">Who owes ₹{money(balanceDue)}?</div>
                {sessionHasGuest ? (
                  <div className="fd-settle-debtor-hint">The guest on this table. They will appear in Money → Dues.</div>
                ) : (
                  <>
                    <div className="fd-settle-debtor-fields">
                      <label>
                        <span>Name</span>
                        <input
                          value={debtorName}
                          onChange={(e) => setDebtorName(e.target.value)}
                          maxLength={150}
                          autoComplete="off"
                          aria-required="true"
                          aria-invalid={missingDebtor}
                        />
                      </label>
                      <label>
                        <span>Mobile</span>
                        <input
                          value={debtorMobile}
                          onChange={(e) => setDebtorMobile(e.target.value)}
                          maxLength={50}
                          inputMode="tel"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <div className="fd-settle-debtor-hint">Shown in Money → Dues so anyone on shift can follow up.</div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                className="fd-btn fd-btn-success"
                onClick={handleSettleBill}
                disabled={settling || tenders.length === 0 || missingRef || missingDebtor}
              >
                {settling
                  ? 'Settling...'
                  : balanceDue > 0
                    ? `Save Partial ₹${money(tendered)}`
                    : `Settle & Post ₹${money(settleTotals.payable)}`}
              </button>
              <button className="fd-btn fd-btn-outline" onClick={() => setSettleOpen(false)} disabled={settling}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Billing
