import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import TimeframePicker from '../../components/frontdesk/TimeframePicker'
import crudService from '../../services/crudService'
import './finance.css'

/**
 * The financial reporting screen.
 *
 * Every figure here comes from the LEDGER — the same numbered documents the
 * accountant reads — never from pos_bill. That distinction is why this screen
 * is separate from Reports (which stays operational: orders, KOTs, tables).
 *
 * The tabs are views over one timeframe, not seven independent screens: the
 * range is owned here and each tab re-queries with it, so switching tabs can
 * never show you two different periods side by side.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const qty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

const TABS = [
  { key: 'overview', label: 'Overview',  icon: '💰' },
  { key: 'sales',    label: 'Sales',     icon: '🧾' },
  { key: 'products', label: 'Products',  icon: '🍽️' },
  { key: 'pending',  label: 'Pending',   icon: '⏳' },
  { key: 'tenders',  label: 'Tenders',   icon: '💳' },
  { key: 'venue',    label: 'Floors & Tables', icon: '🪑' },
  { key: 'channels', label: 'Channels',  icon: '🎫' },
  { key: 'discounts', label: 'Discounts', icon: '🏷️' },
  { key: 'cashflow', label: 'Cash Flow', icon: '🏦' },
  { key: 'expenses', label: 'Expenses',  icon: '💸' },
]

const LOADERS = {
  overview: posService.getFinanceOverview,
  sales:    posService.getSalesReport,
  products: posService.getProductReport,
  pending:  posService.getPendingReport,
  tenders:  posService.getTenderReport,
  venue:     posService.getVenueReport,
  channels:  posService.getChannelReport,
  discounts: posService.getDiscountReport,
  cashflow: posService.getCashFlowReport,
  expenses: posService.getExpenseReport,
}

const Kpi = ({ label, value, accent, hint }) => (
  <div className={`fd-kpi-card ${accent || ''}`}>
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">{value}</span>
    {hint && <span className="kpi-hint">{hint}</span>}
  </div>
)

const Empty = ({ children }) => <div className="fd-empty">{children}</div>

/** A bucket label is a date, an ISO week (YYYYWW) or a month — render each honestly. */
const bucketLabel = (bucket, value) => {
  const v = String(value ?? '')
  if (bucket === 'week' && /^\d{6}$/.test(v)) return `Week ${v.slice(4)} of ${v.slice(0, 4)}`
  if (bucket === 'month') return v
  return v ? new Date(v).toLocaleDateString() : '—'
}

const Finance = () => {
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState({ preset: 'today', bucket: 'day' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState([])
  const [floors, setFloors] = useState([])
  const [tables, setTables] = useState([])

  useEffect(() => {
    // Filter options are optional context; failing to load them must not break
    // the report itself, so each settles independently.
    crudService.getAll('branchDetails', { limit: 200 })
      .then((res) => setBranches(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setBranches([]))
    posService.getFloors({ limit: 200 }).then(setFloors).catch(() => setFloors([]))
    posService.getTables({ limit: 200 }).then(setTables).catch(() => setTables([]))
  }, [])

  const load = useCallback(async () => {
    // A custom range without bounds would be rejected by the server; say so
    // here rather than firing a request we know will 400.
    if (range.preset === 'custom' && (!range.fromDate || !range.toDate)) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setData(await LOADERS[tab](range))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load report')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tab, range])

  useEffect(() => { load() }, [load])

  const needsCustomDates = range.preset === 'custom' && (!range.fromDate || !range.toDate)

  return (
    <div className="fd-finance">
      <div className="fd-reports-header">
        <div>
          <h1>💰 Finance</h1>
          <p className="fd-lead">
            Read from the accounting ledger — the same documents the accountant sees.
          </p>
        </div>
      </div>

      <TimeframePicker
        value={range}
        onChange={setRange}
        onRefresh={load}
        loading={loading}
        branches={branches}
        floors={floors}
        tables={tables}
        showBucket={tab === 'overview' || tab === 'sales' || tab === 'expenses'}
      />

      <div className="fd-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`fd-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {data?.range && (
        <div className="fd-range-note">
          Showing <strong>{data.range.from}</strong> to <strong>{data.range.to}</strong>
          {data.range.weekendOnly && ' · weekends only'}
        </div>
      )}

      {needsCustomDates ? (
        <Empty>Pick a start and end date to run a custom range.</Empty>
      ) : loading ? (
        <div className="fd-loading">Loading report…</div>
      ) : !data ? (
        <Empty>No data for this period.</Empty>
      ) : (
        <div className="fd-finance-body">
          {tab === 'overview' && <OverviewTab data={data} range={range} />}
          {tab === 'sales'    && <SalesTab data={data} range={range} />}
          {tab === 'products' && <ProductsTab data={data} />}
          {tab === 'pending'  && <PendingTab data={data} />}
          {tab === 'tenders'  && <TendersTab data={data} />}
          {tab === 'venue'    && <VenueTab data={data} />}
          {tab === 'channels' && <ChannelsTab data={data} />}
          {tab === 'discounts' && <DiscountsTab data={data} />}
          {tab === 'cashflow' && <CashFlowTab data={data} />}
          {tab === 'expenses' && <ExpensesTab data={data} range={range} />}
        </div>
      )}
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
// Only answerable because expenses post to the same ledger as sales: money in
// and money out are rows in one table, so "what's left" is a subtraction.
const OverviewTab = ({ data, range }) => {
  const s = data.sales || {}
  const net = Number(data.netPosition) || 0
  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Invoiced" value={money(s.GrossAmount)} accent="accent-blue"
             hint="What the documents say" />
        <Kpi label="Collected" value={money(s.Collected)} accent="accent-green"
             hint="What was actually taken" />
        <Kpi label="Outstanding" value={money(s.Outstanding)} accent="accent-orange"
             hint="Invoiced but unpaid" />
        <Kpi label="Spent" value={money(data.expenses?.total)} accent="accent-red"
             hint="Settled expenses" />
        <Kpi label="Net position" value={money(net)} accent={net < 0 ? 'accent-red' : 'accent-green'}
             hint="Collected − spent" />
        <Kpi label="Cash movement" value={money(data.cash?.NetMovement)}
             hint={`In ${money(data.cash?.Inflow)} · Out ${money(data.cash?.Outflow)}`} />
      </div>

      <div className="fd-section-title">Where the money is</div>
      {!data.accounts?.length ? <Empty>No account movement in this period.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr><th>Account</th><th className="num">In</th><th className="num">Out</th><th className="num">Net</th></tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.AccountTypeBaseId}>
                  <td>{a.AccountName}</td>
                  <td className="num">{money(a.Inflow)}</td>
                  <td className="num">{a.Outflow ? `−${money(a.Outflow)}` : money(0)}</td>
                  <td className="num strong">{money(a.NetMovement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TrendTable rows={data.salesTrend} bucket={range.bucket} />
    </>
  )
}

const TrendTable = ({ rows, bucket }) => (
  <>
    <div className="fd-section-title">Sales trend</div>
    {!rows?.length ? <Empty>Nothing sold in this period.</Empty> : (
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Period</th><th className="num">Documents</th>
              <th className="num">Discount</th><th className="num">Tax</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{bucketLabel(bucket, r.Bucket)}</td>
                <td className="num">{r.Documents}</td>
                <td className="num">{money(r.DiscountAmount)}</td>
                <td className="num">{money(r.TaxAmount)}</td>
                <td className="num strong">{money(r.GrossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
)

/* ── Sales ────────────────────────────────────────────────────────────────── */
// Invoiced and collected are reported separately on purpose. Collapsing them
// into one "revenue" number is exactly what hides unpaid money.
const SalesTab = ({ data, range }) => {
  const s = data.summary || {}
  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Documents" value={s.Documents ?? 0} />
        <Kpi label="Net (taxable)" value={money(s.NetAmount)} />
        <Kpi label="Tax" value={money(s.TaxAmount)} />
        <Kpi label="Discount given" value={money(s.DiscountAmount)} accent="accent-orange" />
        <Kpi label="Invoiced" value={money(s.GrossAmount)} accent="accent-blue" />
        <Kpi label="Collected" value={money(s.Collected)} accent="accent-green" />
        <Kpi label="Outstanding" value={money(s.Outstanding)}
             accent={Number(s.Outstanding) > 0 ? 'accent-red' : ''} />
        <Kpi label="Round off" value={money(s.RoundOff)} hint="Cash cannot pay paise" />
      </div>
      <TrendTable rows={data.trend} bucket={range.bucket} />
    </>
  )
}

/* ── Products ─────────────────────────────────────────────────────────────── */
// Quantity, revenue and discount per product, straight off the invoice lines —
// so a renamed or repriced item cannot rewrite what history says was sold.
const ProductsTab = ({ data }) => {
  const rows = data.products || []
  const totals = rows.reduce((t, p) => ({
    qty: t.qty + (Number(p.QuantitySold) || 0),
    discount: t.discount + (Number(p.DiscountAmount) || 0),
    gross: t.gross + (Number(p.GrossAmount) || 0),
  }), { qty: 0, discount: 0, gross: 0 })

  if (!rows.length) return <Empty>No products sold in this period.</Empty>

  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Products sold" value={rows.length} />
        <Kpi label="Units" value={qty(totals.qty)} />
        <Kpi label="Discount given" value={money(totals.discount)} accent="accent-orange" />
        <Kpi label="Revenue" value={money(totals.gross)} accent="accent-green" />
      </div>

      <div className="fd-section-title">Ranked by revenue</div>
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>#</th><th>Product</th><th>Category</th>
              <th className="num">Qty sold</th><th className="num">Net</th>
              <th className="num">Discount</th><th className="num">Tax</th>
              <th className="num">Revenue</th><th className="num">Bills</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.ItemId || i}>
                <td className="muted">{i + 1}</td>
                <td className="strong">{p.ItemName || p.ItemId}</td>
                <td>{p.CategoryName || <span className="muted">—</span>}</td>
                <td className="num">{qty(p.QuantitySold)}</td>
                <td className="num">{money(p.NetAmount)}</td>
                <td className="num">{Number(p.DiscountAmount) > 0
                  ? <span className="fd-discount">−{money(p.DiscountAmount)}</span>
                  : <span className="muted">—</span>}</td>
                <td className="num">{money(p.TaxAmount)}</td>
                <td className="num strong">{money(p.GrossAmount)}</td>
                <td className="num">{p.Documents}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── Pending ──────────────────────────────────────────────────────────────── */
// Two genuinely different questions with different owners, so they are two
// sections rather than one merged list.
const PendingTab = ({ data }) => {
  const unpaid = data.unpaid || {}
  const unbilled = data.unbilled || {}
  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Unpaid (invoiced)" value={money(unpaid.totalOutstanding)} accent="accent-red"
             hint={`${unpaid.documents?.length || 0} document(s)`} />
        <Kpi label="Unbilled (on the floor)" value={money(unbilled.totalValue)} accent="accent-orange"
             hint={`${unbilled.orders?.length || 0} open round(s)`} />
      </div>

      <div className="fd-section-title">Unpaid documents — invoiced, not collected</div>
      {!unpaid.documents?.length ? <Empty>Everything invoiced has been paid.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Invoice</th><th>Date</th><th>Customer</th>
                <th className="num">Invoiced</th><th className="num">Collected</th><th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.documents.map((d) => (
                <tr key={d.Id}>
                  <td className="strong">{d.TransactionNo}</td>
                  <td>{d.TransactionDate ? String(d.TransactionDate).slice(0, 10) : '—'}</td>
                  <td>{d.CustomerName || <span className="muted">Walk-in</span>}</td>
                  <td className="num">{money(d.GrossAmount)}</td>
                  <td className="num">{money(d.Collected)}</td>
                  <td className="num strong fd-outstanding">{money(d.Outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fd-section-title">Unbilled rounds — still open on the floor</div>
      {!unbilled.orders?.length ? <Empty>No open rounds.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr><th>Order</th><th>Type</th><th>Status</th><th className="num">Value</th><th>Opened</th></tr>
            </thead>
            <tbody>
              {unbilled.orders.map((o) => (
                <tr key={o.Id}>
                  <td className="strong">{o.OrderNo}</td>
                  <td>{o.OrderType || '—'}</td>
                  <td><span className="fd-badge fd-badge-pending">{o.Status}</span></td>
                  <td className="num">{money(o.Total)}</td>
                  <td>{o.CreatedOn ? new Date(o.CreatedOn).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ── Tenders (Z-report) ───────────────────────────────────────────────────── */
const TendersTab = ({ data }) => {
  const rows = data.tenders || []
  if (!rows.length) return <Empty>No payments taken in this period.</Empty>
  const total = rows.reduce((s, t) => s + (Number(t.NetAmount) || 0), 0)

  return (
    <>
      <div className="fd-section-title">Tender mix — refunds and expenses netted</div>
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Tender</th><th>Lands in</th><th className="num">Count</th>
              <th className="num">In</th><th className="num">Out</th><th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.PaymentModeId}>
                <td className="strong">{t.PaymentMode}</td>
                <td>{t.AccountName || <span className="muted">—</span>}</td>
                <td className="num">{t.Tenders}</td>
                <td className="num">{money(t.Inflow)}</td>
                <td className="num">{t.Outflow ? `−${money(t.Outflow)}` : <span className="muted">—</span>}</td>
                <td className="num strong">{money(t.NetAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={5} className="strong">Total</td><td className="num strong">{money(total)}</td></tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}


/* ── Floors & tables ──────────────────────────────────────────────────────── */
// Grouped on the venue SNAPSHOT each round froze when it was placed, not on a
// live join to the floor plan — so renaming a table, moving it upstairs or
// retiring it leaves last month's revenue exactly where it was earned.
//
// A bill spanning two tables is apportioned between them by each round's share,
// which is why these totals tie back to the Sales tab rather than merely looking
// plausible.
const VenueTab = ({ data }) => {
  const floors = data.floors || []
  const tables = data.tables || []
  if (!floors.length) return <Empty>No settled bills for this period.</Empty>

  const best = floors[0]

  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Total Revenue" value={money(data.totalGross)} accent="accent-green" />
        <Kpi label="Floors Trading" value={floors.length} accent="accent-blue" />
        <Kpi label="Tables Used" value={tables.length} accent="accent-orange" />
        <Kpi
          label="Top Floor"
          value={best.FloorName}
          accent="accent-blue"
          hint={money(best.GrossAmount)}
        />
      </div>

      <div className="fd-section-title">By floor</div>
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Floor</th><th className="num">Tables</th><th className="num">Seats</th>
              <th className="num">Rounds</th><th className="num">Bills</th>
              <th className="num">Avg Bill</th><th className="num">Per Seat</th>
              <th className="num">Discount</th><th className="num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => (
              <tr key={f.FloorId || f.FloorName}>
                <td className="strong">{f.FloorName}</td>
                <td className="num">{f.Tables}</td>
                <td className="num">{f.Seats || <span className="muted">—</span>}</td>
                <td className="num">{f.Orders}</td>
                <td className="num">{f.Bills}</td>
                <td className="num">{money(f.AvgBillValue)}</td>
                <td className="num">
                  {f.RevenuePerSeat == null ? <span className="muted">—</span> : money(f.RevenuePerSeat)}
                </td>
                <td className="num">{f.DiscountAmount ? `−${money(f.DiscountAmount)}` : <span className="muted">—</span>}</td>
                <td className="num strong">{money(f.GrossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fd-section-title">By table</div>
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Table</th><th>Floor</th><th className="num">Seats</th>
              <th className="num">Rounds</th><th className="num">Bills</th>
              <th className="num">Avg Bill</th><th className="num">Per Seat</th>
              <th className="num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={`${t.FloorId || 'x'}-${t.TableId || t.TableName}`}>
                <td className="strong">{t.TableName}</td>
                <td>{t.FloorName}</td>
                <td className="num">{t.Capacity || <span className="muted">—</span>}</td>
                <td className="num">{t.Orders}</td>
                <td className="num">{t.Bills}</td>
                <td className="num">{money(t.AvgBillValue)}</td>
                <td className="num">
                  {t.RevenuePerSeat == null ? <span className="muted">—</span> : money(t.RevenuePerSeat)}
                </td>
                <td className="num strong">{money(t.GrossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── Channels ─────────────────────────────────────────────────────────────── */
// Where the sale happened: dine-in, counter, delivery.
//
// Counter revenue was always in every total — a counter bill posts the same
// ledger document as any other — but nothing could name it, so "how much came
// over the counter?" had no answer. The queue block beside it comes from
// pos_token rather than the ledger, because how long somebody stood at a
// counter is a real question but not an accounting one.

/** A minutes figure, or an explicit dash — "no waits recorded" is not zero. */
const minutes = (n) =>
  (n == null ? <span className="muted">—</span> : `${n} min`)

const QueueBlock = ({ queue }) => {
  // Null when the caller lacks POS scopes, or the endpoint failed. The money
  // half of the tab still stands on its own, so this simply says why.
  if (!queue) {
    return (
      <p className="fd-lead">
        Counter queue statistics are not available for your access level.
      </p>
    )
  }
  const s = queue.summary || {}
  if (!s.Issued) return <Empty>No counter tokens issued in this period.</Empty>

  return (
    <div className="fd-kpi-grid">
      <Kpi label="Tokens issued" value={s.Issued} accent="accent-blue" />
      <Kpi label="Served" value={s.Served} accent="accent-green"
           hint={s.Waiting || s.Called ? `${s.Waiting + s.Called} still open` : 'All handed over'} />
      {/* Issue → called is the customer's wait; called → collected is how long
          they took to walk up. Merging them would blame the kitchen for a
          customer who wandered off. */}
      <Kpi label="Average wait" value={minutes(s.AvgWaitMinutes)} accent="accent-orange"
           hint="Issued until called" />
      <Kpi label="Longest wait" value={minutes(s.MaxWaitMinutes)}
           hint="The worst one, not the average" />
      <Kpi label="Collection time" value={minutes(s.AvgCollectMinutes)}
           hint="Called until handed over" />
    </div>
  )
}

const ChannelsTab = ({ data }) => {
  const channels = data.channels || []
  if (!channels.length) return <Empty>No settled bills for this period.</Empty>

  const counter = channels.find((c) => c.Channel === 'Counter')
  const top = channels[0]

  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Total Revenue" value={money(data.totalGross)} accent="accent-green" />
        <Kpi label="Top Channel" value={top.Channel} accent="accent-blue"
             hint={`${money(top.GrossAmount)} · ${top.ShareOfRevenue}%`} />
        <Kpi label="Counter Revenue" value={money(counter?.GrossAmount || 0)} accent="accent-orange"
             hint={counter ? `${counter.ShareOfRevenue}% of takings` : 'No counter sales'} />
        <Kpi label="Counter Bills" value={counter?.Bills || 0}
             hint={counter ? `Avg ${money(counter.AvgBillValue)}` : '—'} />
      </div>

      <div className="fd-section-title">By channel</div>
      <div className="fd-table-scroll">
        <table className="fd-table">
          <thead>
            <tr>
              <th>Channel</th><th className="num">Orders</th><th className="num">Bills</th>
              <th className="num">Avg Bill</th><th className="num">Discount</th>
              <th className="num">Tax</th><th className="num">Revenue</th><th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.Channel}>
                <td className="strong">{c.Channel}</td>
                <td className="num">{c.Orders}</td>
                <td className="num">{c.Bills}</td>
                <td className="num">{money(c.AvgBillValue)}</td>
                <td className="num">
                  {c.DiscountAmount ? `−${money(c.DiscountAmount)}` : <span className="muted">—</span>}
                </td>
                <td className="num">{money(c.TaxAmount)}</td>
                <td className="num strong">{money(c.GrossAmount)}</td>
                <td className="num">{c.ShareOfRevenue}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fd-section-title">Counter queue</div>
      <QueueBlock queue={data.queue} />
    </>
  )
}

/* ── Discounts ────────────────────────────────────────────────────────────── */
// Split by WHY throughout. "Item" is a decision someone made about that dish;
// "bill" is its share of a discount given on the whole bill. Only the first
// tells you which products you actually give away.
const DiscountsTab = ({ data }) => {
  const s = data.summary || {}
  const products = data.products || []
  const bills = data.bills || []
  const share = Number(s.GrossAmount) > 0
    ? ((Number(s.DiscountAmount) / (Number(s.GrossAmount) + Number(s.DiscountAmount))) * 100).toFixed(1)
    : '0.0'

  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi
          label="Total Discount" value={money(s.DiscountAmount)} accent="accent-red"
          hint={`${share}% of what would have been billed`}
        />
        <Kpi label="On Items" value={money(s.ItemDiscountAmount)} accent="accent-orange"
          hint="Given on a specific dish" />
        <Kpi label="On Bills" value={money(s.BillDiscountAmount)} accent="accent-blue"
          hint="Whole-bill, spread across dishes" />
        <Kpi label="Bills Discounted" value={s.Documents || 0} accent="accent-green" />
      </div>

      <div className="fd-section-title">By product</div>
      {!products.length ? <Empty>Nothing was discounted in this period.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Product</th><th className="num">Qty</th>
                <th className="num">On Item</th><th className="num">On Bill</th>
                <th className="num">Total Off</th><th className="num">Still Billed</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.ItemId || p.ItemName}>
                  <td className="strong">{p.ItemName || <span className="muted">Unnamed</span>}</td>
                  <td className="num">{qty(p.QuantitySold)}</td>
                  <td className="num">{money(p.ItemDiscountAmount)}</td>
                  <td className="num">{money(p.BillDiscountAmount)}</td>
                  <td className="num strong">−{money(p.DiscountAmount)}</td>
                  <td className="num">{money(p.GrossAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fd-section-title">By bill</div>
      {!bills.length ? <Empty>No discounted bills in this period.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Invoice</th><th>Date</th><th>Customer</th>
                <th className="num">On Items</th><th className="num">On Bill</th>
                <th className="num">Total Off</th><th className="num">Billed</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.Id}>
                  <td className="strong">{b.TransactionNo}</td>
                  <td>{b.TransactionDate ? new Date(b.TransactionDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td>{b.CustomerName || <span className="muted">—</span>}</td>
                  <td className="num">{money(b.ItemDiscountAmount)}</td>
                  <td className="num">{money(b.BillDiscountAmount)}</td>
                  <td className="num strong">−{money(b.DiscountAmount)}</td>
                  <td className="num">{money(b.GrossAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ── Cash flow ─────────────────────────────────────────────────────────────── */
// Asset accounts only: this is "where is the money", not "what did we earn".
const CashFlowTab = ({ data }) => {
  const rows = data.accounts || []
  const t = data.totals || {}
  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Money in" value={money(t.Inflow)} accent="accent-green" />
        <Kpi label="Money out" value={money(t.Outflow)} accent="accent-red" />
        <Kpi label="Net movement" value={money(t.NetMovement)}
             accent={Number(t.NetMovement) < 0 ? 'accent-red' : 'accent-blue'} />
      </div>

      <div className="fd-section-title">By account</div>
      {!rows.length ? <Empty>No cash movement in this period.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr><th>Account</th><th>Kind</th><th className="num">In</th><th className="num">Out</th><th className="num">Net</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.AccountTypeBaseId}>
                  <td className="strong">{a.AccountName}</td>
                  <td><span className="fd-badge">{a.AccountKind}</span></td>
                  <td className="num">{money(a.Inflow)}</td>
                  <td className="num">{a.Outflow ? `−${money(a.Outflow)}` : <span className="muted">—</span>}</td>
                  <td className="num strong">{money(a.NetMovement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */
// Settled expense documents only. A draft or merely approved claim is not a
// cost and correctly counts as nothing here.
const ExpensesTab = ({ data, range }) => {
  const rows = data.categories || []
  const total = Number(data.totalAmount) || 0
  return (
    <>
      <div className="fd-kpi-grid">
        <Kpi label="Total spend" value={money(total)} accent="accent-red"
             hint="Settled expenses only" />
        <Kpi label="Categories" value={rows.length} />
      </div>

      <div className="fd-section-title">By category</div>
      {!rows.length ? <Empty>No expenses settled in this period.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr><th>Category</th><th className="num">Entries</th><th className="num">Amount</th><th className="num">Share</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ExpenseCategoryId}>
                  <td className="strong">{r.CategoryName}</td>
                  <td className="num">{r.Entries}</td>
                  <td className="num strong">{money(r.Amount)}</td>
                  <td className="num">{total ? `${Math.round((r.Amount / total) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fd-section-title">Spend trend</div>
      {!data.trend?.length ? <Empty>No trend data.</Empty> : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead><tr><th>Period</th><th className="num">Entries</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {data.trend.map((r, i) => (
                <tr key={i}>
                  <td>{bucketLabel(range.bucket, r.Bucket)}</td>
                  <td className="num">{r.Entries}</td>
                  <td className="num strong">{money(r.Amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default Finance
